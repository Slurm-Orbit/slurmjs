import { execSync } from "node:child_process";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';

dayjs.extend(duration);

function unixSecondsToDate(seconds) {
    if (!seconds) return null;
    return new Date(seconds * 1000);
}

function getOption(key) {
    return key.length > 1 ? "--" : "-" + key;
} 
function runSlurmCommand(command, args = [], options = [], kwargs = {}) {
    var kwargsLine = Object.entries(kwargs)
        .map(([key, value]) => getOption(key) + " " + value)
        .join(" ") + " ";
    var optionLine = Object.entries(options)
        .map(key => getOption(key))
        .join(" ");
    var argsLine = args.join(" ");
    try {
        return execSync(`${command} ${kwargsLine} ${optionLine} ${argsLine}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).toString();
    } catch (err) {
        var message = err.message;
        var errorIndex = message.indexOf("error:");
        if (errorIndex != -1) {
            throw new Error(message.substring(errorIndex + 6).trim(), { cause: err });
        }
        throw err;
    }
}

async function getSlurmVersion(){
    var output = runSlurmCommand("sinfo", [], ["version"]);
    return output.trim().split(" ")[1];
}

async function getSlurmQueueInfo(options = {}) {
    var output = runSlurmCommand(
        "squeue",
        [],
        ["json", ...Object.keys(options)],
    );
    var resJson = JSON.parse(output);
    return resJson.jobs.map(job => {
        var startTime = unixSecondsToDate(job.start_time.number);
        var runningTime;
        if (job.job_state.includes("RUNNING")){
            var currentTime = new Date();
            runningTime = currentTime - startTime;
        }
        else{
            var endTime = unixSecondsToDate(job.end_time.number);
            runningTime = endTime - startTime;
        }
        return {
            jobId: job.job_id,
            account: job.account,
            user: job.user_name,
            status: job.job_state,
            cluster: job.cluster,
            nodes: job.nodes,
            cpus: job.cpus.number,
            memory: job.memory_per_node.number,
            gres: job.gres_detail,
            partition: job.partition,
            timeLimit: job.time_limit.number,
            submitTime: unixSecondsToDate(job.submit_time.number),
            startTime: unixSecondsToDate(job.start_time.number),
            runningTime: dayjs.duration(runningTime, 'seconds'),
            name: job.name,
        };
    });
}

async function submitSlurmJob(jobScript, options = {}) {
    var output = runSlurmCommand(
        "sbatch",
        [jobScript],
        Object.keys(options),
    );
    return parseInt(output.split(" ")[3]);
}

async function cancelSlurmJob(jobId, options = {}) {
    runSlurmCommand("scancel", [jobId], Object.keys(options));
}

async function holdSlurmJob(jobId, options = {}) {
    runSlurmCommand("scontrol", ["hold", String(jobId)], Object.keys(options));
}

async function releaseSlurmJob(jobId, options = {}) {
    runSlurmCommand("scontrol", ["release", String(jobId)], Object.keys(options));
}

async function getSlurmClusterInfo(options = {}) {
    var output = runSlurmCommand(
        "sinfo",
        [],
        ["json", ...Object.keys(options)],
    );
    var resJson = JSON.parse(output);
    return resJson.sinfo.map(sinfo => {
        return {
            name: sinfo.partition.name,
            availability: sinfo.partition.partition.state,
            memory: sinfo.memory.maximum,
            disk: sinfo.disk.maximum,
            cpus: sinfo.cpus.maximum,
            gres: sinfo.gres.total,
            state: sinfo.node.state,
            nodes: sinfo.nodes.nodes,
            time_limit: sinfo.partition.maximums.time.number,
        };
    });
}

async function getSlurmJobInfo(options = {}) {
    var output = runSlurmCommand(
        "sacct",
        [],
        ["json", ...Object.keys(options)],
    );
    var resJson = JSON.parse(output);
    return resJson.jobs.map(job => {
        return {
            jobId: job.job_id,
            account: job.account,
            user: job.user,
            cluster: job.cluster,
            name: job.name,
            partition: job.partition,
            stdout: job.stdout_expanded,
            stderr: job.stderr_expanded,
            exitCode: job.exit_code.return_code.number,
            workDir: job.working_directory,
            status: job.state.current,
            submitTime: unixSecondsToDate(job.time.submission),
            startTime: unixSecondsToDate(job.time.start),
            endTime: unixSecondsToDate(job.time.end),
        };
    });
}

async function updateSlurmNodeState(nodeName, state, options = {}) {
    runSlurmCommand(
        "scontrol",
        ["update", `NodeName=${nodeName}`, `State=${state}`],
        Object.keys(options),
    );
}

async function getSlurmJobStat(jobId, target, options = {}) {
    var output = runSlurmCommand(
        "sstat",
        [],
        ["allsteps", "parsable2", ...Object.keys(options)],
        { format: target.join(","), jobs: String(jobId) },
    );
    var lines = (output || "").trim().split("\n").filter(Boolean);
    if (lines.length < 2) {
        return {};
    }
    var headers = lines[0].split("|");
    var cols = lines[1].split("|");
    return cols.reduce((acc, col, index) => {
        acc[headers[index]] = col;
        return acc;
    }, {});
}

async function getSlurmAccountInfo(options = {}) {
    var output = runSlurmCommand(
        "sacctmgr",
        ["list", "account"],
        ["json", ...Object.keys(options)],
    );
    var resJson = JSON.parse(output);
    return (resJson.accounts || []).map(record => ({
        name: record.name,
        description: record.description,
        organization: record.organization,
        flags: record.flags,
    }));
}

async function addSlurmAccount(options = {}, parent = "", description = "") {
    var output = runSlurmCommand(
        "sacctmgr",
        ["add", "account", `parent=${parent}`, `description=${description}`],
        ["immediate", ...Object.keys(options)],
    );
    return (output || "").trim();
}

async function modifySlurmAccount(where, set, options = {}) {
    var output = runSlurmCommand(
        "sacctmgr",
        ["modify", "account", "where", `name=${where}`, "set", `description=${set}`],
        ["immediate", ...Object.keys(options)],
    );
    return (output || "").trim();
}

async function deleteSlurmAccount(name, options = {}) {
    var output = runSlurmCommand(
        "sacctmgr",
        ["delete", "account", `name=${name}`],
        ["immediate", ...Object.keys(options)],
    );
    return (output || "").trim();
}

export {
    getSlurmVersion,
    getSlurmJobInfo,
    submitSlurmJob,
    cancelSlurmJob,
    getSlurmClusterInfo,
    getSlurmQueueInfo,
    updateSlurmNodeState,
    getSlurmJobStat,
    holdSlurmJob,
    releaseSlurmJob,
    getSlurmAccountInfo,
    addSlurmAccount,
    modifySlurmAccount,
    deleteSlurmAccount,
};
