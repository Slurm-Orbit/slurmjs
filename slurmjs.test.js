import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import {
    getSlurmClusterInfo,
    getSlurmJobInfo,
    getFinishedSlurmJobInfo,
    submitSlurmJob,
    cancelSlurmJob,
    updateSlurmNodeState,
} from "./index.js";

const JOB_SCRIPT = `#!/bin/bash
#SBATCH --job-name=wait_test
#SBATCH --output=wait_test_%j.out
#SBATCH --error=wait_test_%j.err
#SBATCH --time=24:00:00
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --partition=GPU
#SBATCH --mem=10M
#SBATCH --gres=gpu:1
echo "Job started at $(date)"
echo "Node: $(hostname)"
echo "Job ID: $SLURM_JOB_ID"
echo "Entering wait"
sleep 100000
echo "Job finished at $(date)"
`;

describe("slurmjs", () => {
    let jobId;
    let jobScriptPath;

    beforeAll(async () => {
        jobScriptPath = join(tmpdir(), `slurmjs-test-${Date.now()}.slurm`);
        await Bun.write(jobScriptPath, JOB_SCRIPT);
    });

    test("getSlurmClusterInfo returns cluster partitions", async () => {
        const res = await getSlurmClusterInfo();
        expect(res.success).toBe(true);
        expect(Array.isArray(res.data)).toBe(true);
        expect(res.data.length).toBeGreaterThan(0);
        expect(res.data[0]).toMatchObject({
            name: expect.any(String),
            availability: expect.anything(),
            cpus: expect.any(Number),
        });
    });

    test("submitSlurmJob submits a job script", async () => {
        const res = await submitSlurmJob(jobScriptPath);
        expect(res.success).toBe(true);
        expect(typeof res.data).toBe("number");
        expect(res.data).toBeGreaterThan(0);
        jobId = res.data;
    });

    test("getSlurmJobInfo returns queue jobs", async () => {
        expect(jobId).toBeDefined();
        const res = await getSlurmJobInfo();
        expect(res.success).toBe(true);
        expect(Array.isArray(res.data)).toBe(true);

        const job = res.data.find((j) => j.jobId === jobId);
        expect(job).toBeDefined();
        expect(job).toMatchObject({
            jobId,
            name: expect.any(String),
            status: expect.anything(),
            user: expect.any(String),
        });
    });

    test("getFinishedSlurmJobInfo returns finished jobs", async () => {
        const res = await getFinishedSlurmJobInfo();
        expect(res.success).toBe(true);
        expect(Array.isArray(res.data)).toBe(true);
        if (res.data.length > 0) {
            expect(res.data[0]).toMatchObject({
                jobId: expect.any(Number),
                name: expect.any(String),
                status: expect.anything(),
            });
        }
    });

    test("cancelSlurmJob cancels a submitted job", async () => {
        expect(jobId).toBeDefined();
        const res = await cancelSlurmJob(jobId);
        expect(res.success).toBe(true);
    });

    test("updateSlurmNodeState returns a structured result", async () => {
        const cluster = await getSlurmClusterInfo();
        expect(cluster.success).toBe(true);
        const nodeName = cluster.data[0]?.nodes?.[0];
        expect(nodeName).toBeDefined();

        const res = await updateSlurmNodeState(nodeName, "DRAIN", "slurmjs unit test");
        expect(res).toHaveProperty("success");
        if (res.success) {
            expect(res.data).toBe("");
            const resume = await updateSlurmNodeState(nodeName, "RESUME");
            expect(resume.success).toBe(true);
        } else {
            expect(typeof res.error).toBe("string");
            expect(res.error.length).toBeGreaterThan(0);
        }
    });

    afterAll(async () => {
        if (jobId) {
            await cancelSlurmJob(jobId).catch(() => {});
        }
        if (jobScriptPath) {
            await unlink(jobScriptPath).catch(() => {});
        }
    });
});
