import { execSync } from "node:child_process";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

function unixSecondsToDate(seconds) {
    if (!seconds) return null;
    return new Date(seconds * 1000);
}

function runSlurmCommand(command, kwargs, args=[]) {
    var argLine = Object.entries(kwargs)
        .map(([key, value]) => `${key.length > 1 ? "--" : "-"}${key} ${value}`)
        .join(" ") + " " + args.join(" ");
    var error = null;
    var output = null;
    try {
        output = execSync(`${command} ${argLine}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).toString();
    } catch (err) {
        error = err.message;
        var errorIndex = error.indexOf("error:");
        if (errorIndex != -1) {
            var errorMessage = error.substring(errorIndex + 6).trim();
            error = errorMessage;
        }
        else{
            var errorLines = error.split("\n");
            errorLines = errorLines.slice(1);
            error = errorLines.join("");
        }
    }
    return [error, output];
}

async function getSlurmJobInfo(kwargs = {}) {
    var [error, output] = runSlurmCommand("squeue", {...kwargs, "json": ""});
    var resJson = JSON.parse(output);
    var conciseJson = resJson.jobs.map(job => {
        var startTime = unixSecondsToDate(job.start_time.number);
        var runningTime = 0;
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
    if (error) {
        return {
            error: error,
            success: false,
        };
    }
    return {
        success: true,
        data: conciseJson,
    };
}

async function submitSlurmJob(jobScript, kwargs = {}) {
    var [error, output] = runSlurmCommand("sbatch", kwargs, [jobScript]);
    var jobId = output.split(" ")[3];
    if (error) {
        return {
            error: error,
            success: false,
        };
    }
    return {
        success: true,
        data: parseInt(jobId),
    };
}

async function cancelSlurmJob(jobId, kwargs = {}) {
    var [error, output] = runSlurmCommand("scancel", kwargs, [jobId]);
    if (error) {
        return {
            error: error,
            success: false,
        };
    }
    return {
        success: true,
        data: "",
    };
}

async function getSlurmClusterInfo(kwargs = {}) {
    var [error, output] = runSlurmCommand("sinfo", {...kwargs, "json": ""});
    var resJson = JSON.parse(output);
    var conciseJson = resJson.sinfo.map(sinfo => {
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
    if (error) {
        return {
            error: error,
            success: false,
        };
    }
    return {
        success: true,
        data: conciseJson,
    };
}

async function getFinishedSlurmJobInfo(kwargs = {}) {
    var [error, output] = runSlurmCommand(
        "sacct",
        {...kwargs, "json": ""}
    );
    if (error) {
        return {
            error: error,
            success: false,
        };
    }
    var resJson = JSON.parse(output);
    var conciseJson = resJson.jobs.filter(job => !job.state.current.includes("RUNNING")).map(job => {
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
    })
    return {
        success: true,    
        data: conciseJson,
    };
}
export { getSlurmJobInfo, submitSlurmJob, cancelSlurmJob, getSlurmClusterInfo, getFinishedSlurmJobInfo };
