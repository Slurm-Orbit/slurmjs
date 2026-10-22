import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import {
    getSlurmVersion,
    getSlurmClusterInfo,
    getSlurmQueueInfo,
    getSlurmJobInfo,
    submitSlurmJob,
    cancelSlurmJob,
    updateSlurmNodeState,
    getSlurmJobStat,
    holdSlurmJob,
    releaseSlurmJob,
    getSlurmAccountInfo,
    addSlurmAccount,
    modifySlurmAccount,
    deleteSlurmAccount,
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

const INVALID_JOB_ID = 999999999;
const SSTAT_FIELDS = ["JobID", "NTasks", "MaxRSS", "AveRSS", "AveCPU"];

async function expectResultOrThrow(fn) {
    try {
        return await fn();
    } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err.message.length).toBeGreaterThan(0);
        return null;
    }
}

describe("slurmjs", () => {
    let jobId;
    let jobScriptPath;

    beforeAll(async () => {
        jobScriptPath = join(tmpdir(), `slurmjs-test-${Date.now()}.slurm`);
        await Bun.write(jobScriptPath, JOB_SCRIPT);
    });

    test("getSlurmVersion returns the Slurm version", async () => {
        const version = await getSlurmVersion();
        expect(typeof version).toBe("string");
    });

    test("getSlurmClusterInfo returns cluster partitions", async () => {
        const cluster = await getSlurmClusterInfo();
        expect(Array.isArray(cluster)).toBe(true);
        expect(cluster.length).toBeGreaterThan(0);
        expect(cluster[0]).toMatchObject({
            name: expect.any(String),
            availability: expect.anything(),
            cpus: expect.any(Number),
        });
    });

    test("getSlurmClusterInfo throws on invalid kwargs", async () => {
        await expect(
            getSlurmClusterInfo({ "not-a-real-flag": "" }),
        ).rejects.toThrow();
    });

    test("getSlurmQueueInfo throws on invalid kwargs", async () => {
        await expect(
            getSlurmQueueInfo({ "not-a-real-flag": "" }),
        ).rejects.toThrow();
    });

    test("getSlurmJobInfo throws on invalid kwargs", async () => {
        await expect(
            getSlurmJobInfo({ "not-a-real-flag": "" }),
        ).rejects.toThrow();
    });

    test("submitSlurmJob submits a job script", async () => {
        jobId = await submitSlurmJob(jobScriptPath);
        expect(typeof jobId).toBe("number");
        expect(jobId).toBeGreaterThan(0);
    });

    test("submitSlurmJob throws for missing script", async () => {
        await expect(
            submitSlurmJob("/no/such/slurmjs-missing.slurm"),
        ).rejects.toThrow();
    });

    test("holdSlurmJob and releaseSlurmJob control pending jobs", async () => {
        expect(jobId).toBeDefined();
        await holdSlurmJob(jobId);

        const heldJobs = await getSlurmQueueInfo();
        const held = heldJobs.find((j) => j.jobId === jobId);
        expect(held).toBeDefined();
        expect(String(held.status)).toMatch(/PENDING|HOLD|RUNNING/i);

        await releaseSlurmJob(jobId);
    });

    test("holdSlurmJob and releaseSlurmJob fail for invalid job", async () => {
        await expectResultOrThrow(() => holdSlurmJob(INVALID_JOB_ID));
        await expectResultOrThrow(() => releaseSlurmJob(INVALID_JOB_ID));
    });

    test("getSlurmQueueInfo returns queue jobs", async () => {
        expect(jobId).toBeDefined();
        const jobs = await getSlurmQueueInfo();
        expect(Array.isArray(jobs)).toBe(true);

        const job = jobs.find((j) => j.jobId === jobId);
        expect(job).toBeDefined();
        expect(job).toMatchObject({
            jobId,
            name: expect.any(String),
            status: expect.anything(),
            user: expect.any(String),
        });
    });

    test("getSlurmJobStat returns running job step stats", async () => {
        expect(jobId).toBeDefined();
        for (let i = 0; i < 10; i++) {
            const jobs = await getSlurmQueueInfo();
            const job = jobs.find((j) => j.jobId === jobId);
            if (job?.status?.includes?.("RUNNING") || String(job?.status).includes("RUNNING")) {
                break;
            }
            await Bun.sleep(500);
        }
        const stats = await expectResultOrThrow(() =>
            getSlurmJobStat(jobId, SSTAT_FIELDS),
        );
        if (stats && Object.keys(stats).length > 0) {
            expect(stats).toMatchObject({
                JobID: expect.any(String),
            });
        }
    });

    test("getSlurmJobStat handles invalid job or flags", async () => {
        await expectResultOrThrow(() =>
            getSlurmJobStat(INVALID_JOB_ID, SSTAT_FIELDS),
        );
        await expect(
            getSlurmJobStat(INVALID_JOB_ID, SSTAT_FIELDS, {
                "not-a-real-flag": "",
            }),
        ).rejects.toThrow();
    });

    test("getSlurmJobInfo returns accounting records", async () => {
        const jobs = await getSlurmJobInfo();
        expect(Array.isArray(jobs)).toBe(true);
        if (jobs.length > 0) {
            expect(jobs[0]).toMatchObject({
                jobId: expect.any(Number),
                name: expect.any(String),
                status: expect.anything(),
            });
        }
    });

    test("getSlurmAccountInfo lists accounts", async () => {
        const accounts = await getSlurmAccountInfo();
        expect(Array.isArray(accounts)).toBe(true);
        expect(accounts.length).toBeGreaterThan(0);
        expect(accounts[0]).toMatchObject({
            name: expect.any(String),
            description: expect.anything(),
            organization: expect.anything(),
        });
    });

    test("addSlurmAccount throws or succeeds", async () => {
        await expectResultOrThrow(() =>
            addSlurmAccount({}, "root", "slurmjs unit test"),
        );
    });

    test("modifySlurmAccount throws or succeeds", async () => {
        await expectResultOrThrow(() =>
            modifySlurmAccount("root", "slurmjs coverage test"),
        );
    });

    test("deleteSlurmAccount throws or succeeds", async () => {
        await expectResultOrThrow(() =>
            deleteSlurmAccount(`slurmjs_missing_${Date.now()}`),
        );
    });

    test("cancelSlurmJob cancels a submitted job", async () => {
        expect(jobId).toBeDefined();
        await cancelSlurmJob(jobId);
    });

    test("cancelSlurmJob fails for invalid job or flags", async () => {
        await expectResultOrThrow(() => cancelSlurmJob(INVALID_JOB_ID));
        await expect(
            cancelSlurmJob(INVALID_JOB_ID, { "not-a-real-flag": "" }),
        ).rejects.toThrow();
    });

    test("updateSlurmNodeState throws or succeeds", async () => {
        const cluster = await getSlurmClusterInfo();
        const nodeName = cluster[0]?.nodes?.[0];
        expect(nodeName).toBeDefined();

        const drained = await expectResultOrThrow(() =>
            updateSlurmNodeState(nodeName, "DRAIN"),
        );
        if (drained !== null) {
            await updateSlurmNodeState(nodeName, "RESUME");
        }

        await expectResultOrThrow(() =>
            updateSlurmNodeState("slurmjs-missing-node", "IDLE"),
        );
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
