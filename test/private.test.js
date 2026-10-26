import { describe, test, expect } from "bun:test";
import { runSlurmCommand } from "../lib/commands.js";

describe("runSlurmCommand", () => {
    test("success", () => {
        const output = runSlurmCommand("sinfo", [], ["version"]);
        expect(typeof output).toBe("string");
    });

    test("failed with error: in stderr", () => {
        expect(() =>
            runSlurmCommand("sstat", [], ["parsable2"], { format: "JobID", jobs: "999999999" }),
        ).toThrow(/couldn't get steps/);
    });

    test("failed with unrecognized option in stderr", () => {
        expect(() =>
            runSlurmCommand("sinfo", [], ["not-a-real-flag"]),
        ).toThrow(/unrecognized option/);
    });

    test("failed with non-zero exit and empty stderr", () => {
        expect(() =>
            runSlurmCommand("false", [], []),
        ).toThrow(/failed with exit code/);
    });

    test("unknown command", () => {
        expect(() =>
            runSlurmCommand("not_a_real_slurmjs_cmd_xyz", [], []),
        ).toThrow(/not found/);
    });
});
