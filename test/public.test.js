import { describe, test, expect, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import * as slurmjs from "../index.js";

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
sleep 1000000
echo "Job finished at $(date)"
`;

const INVALID_JOB_ID = 999999999;

describe("slurmjs", () => {
    let jobId;
    let accountName = `test_slurm_account`;
    const jobScriptPath = join(tmpdir(), `slurmjs-test-${Date.now()}.slurm`);
    Bun.write(jobScriptPath, JOB_SCRIPT);

    test("getSlurmVersion returns the Slurm version", async () => {
        const version = await slurmjs.getSlurmVersion();
        expect(typeof version).toBe("string");
    });

    test("Slurm command throws on invalid kwargs", async () => {
        await expect(
            slurmjs.getSlurmClusterInfo({ "not-a-real-flag": "" }),
        ).rejects.toThrow();
    });

    test("getSlurmClusterInfo returns cluster partitions", async () => {
        const cluster = await slurmjs.getSlurmClusterInfo();
        expect(Array.isArray(cluster)).toBe(true);
        expect(cluster[0]).toMatchObject({
            name: expect.any(String),
            availability: expect.anything(),
            cpus: expect.any(Number),
        });
    });

    test("submitSlurmJob submits a job script", async () => {
        jobId = await slurmjs.submitSlurmJob(jobScriptPath);
        expect(typeof jobId).toBe("number");
    });

    test("submitSlurmJob throws for missing script", async () => {
        await expect(
            slurmjs.submitSlurmJob("/no/such/slurmjs-missing.slurm"),
        ).rejects.toThrow();
    });

    test("holdSlurmJob and releaseSlurmJob control pending jobs", async () => {
        await slurmjs.holdSlurmJob(jobId);
        const heldJobs = await slurmjs.getSlurmQueueInfo();
        const held = heldJobs.find((j) => j.jobId === jobId);
        expect(String(held.status)).toMatch(/PENDING/i);

        await slurmjs.releaseSlurmJob(jobId);
        await Bun.sleep(3000)
        const releasedJobs = await slurmjs.getSlurmQueueInfo();
        const released = releasedJobs.find((j) => j.jobId === jobId);
        expect(String(released.status)).toMatch(/RUNNING/i);
    });

    test("holdSlurmJob and releaseSlurmJob throw for invalid job", async () => {
        await expect(slurmjs.holdSlurmJob(INVALID_JOB_ID)).rejects.toThrow();
        await expect(slurmjs.releaseSlurmJob(INVALID_JOB_ID)).rejects.toThrow();
    });

    test("getSlurmQueueInfo returns queue jobs", async () => {
        const jobs = await slurmjs.getSlurmQueueInfo();
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
        let stats = await slurmjs.getSlurmJobStat(jobId, ["JobID", "NTasks", "MaxRSS", "AveRSS", "AveCPU"]);
        expect(stats).toMatchObject({
            JobID: expect.any(String),
        });
    });

    test("getSlurmJobStat returns no information", async () => {
        let stats = await slurmjs.getSlurmJobStat(jobId, ["MaxRSS"]);
        expect(stats).toMatchObject({});
    });

    test("getSlurmJobStat throws for invalid job or fields", async () => {
        await expect(
            slurmjs.getSlurmJobStat(INVALID_JOB_ID, ["JobID"]),
        ).rejects.toThrow();
        await expect(
            slurmjs.getSlurmJobStat(INVALID_JOB_ID, ["InvalidField"]),
        ).rejects.toThrow();
    });

    test("getSlurmJobInfo returns accounting records", async () => {
        const jobs = await slurmjs.getSlurmJobInfo();
        expect(Array.isArray(jobs)).toBe(true);
        expect(jobs[0]).toMatchObject({
            jobId: expect.any(Number),
            name: expect.any(String),
            status: expect.anything(),
        });
    });

    test("getSlurmAccountInfo lists accounts", async () => {
        const accounts = await slurmjs.getSlurmAccountInfo();
        expect(Array.isArray(accounts)).toBe(true);
        expect(accounts[0]).toMatchObject({
            name: expect.any(String),
            description: expect.anything(),
            organization: expect.anything(),
        });
    });

    test("addSlurmAccount adds an account", async () => {
        await slurmjs.addSlurmAccount(
            accountName,
            "root",
            "slurmjs unit test",
        );
        var addedAccount = (await slurmjs.getSlurmAccountInfo()).find((a) => a.name === accountName);
        expect(addedAccount).toMatchObject({
            name: accountName,
            description: expect.anything(),
        });
    });

    test("modifySlurmAccount changes an account description", async () => {
        await slurmjs.modifySlurmAccount(
            accountName,
            "slurmjs unit test",
        );
        var modifiedAccount = (await slurmjs.getSlurmAccountInfo()).find((a) => a.name === accountName);
        expect(modifiedAccount).toMatchObject({
            description: "slurmjs unit test",
        });
    });

    test("deleteSlurmAccount deletes an account", async () => {
        await slurmjs.deleteSlurmAccount(accountName);
        var deletedAccount = (await slurmjs.getSlurmAccountInfo()).find((a) => a.name === accountName);
        expect(deletedAccount).toBeUndefined();
    });

    test("cancelSlurmJob cancels a submitted job", async () => {
        await slurmjs.cancelSlurmJob(jobId);
    });

    test("updateSlurmNodeState throws for missing node", async () => {
        await expect(
            slurmjs.updateSlurmNodeState("slurmjs-missing-node", "IDLE"),
        ).rejects.toThrow();
    });

    afterAll(async () => {
        if (jobId) {
            await slurmjs.cancelSlurmJob(jobId).catch(() => {});
            const jobs = await slurmjs.getSlurmJobInfo().catch(() => []);
            const job = jobs.find((j) => j.jobId === jobId);
            if (job?.stdout) {
                await unlink(job.stdout).catch(() => {});
            }
            if (job?.stderr) {
                await unlink(job.stderr).catch(() => {});
            }
        }
        if (jobScriptPath) {
            await unlink(jobScriptPath).catch(() => {});
        }
    });
});

