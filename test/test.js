import {
    getSlurmClusterInfo,
    getSlurmJobInfo,
    getFinishedSlurmJobInfo,
    submitSlurmJob,
    cancelSlurmJob,
} from "../index.js";

var clusterInfo = await getSlurmClusterInfo();
console.log(clusterInfo.data);
var res = await submitSlurmJob("test.slurm");
console.log(res);
var jobs = await getSlurmJobInfo();
console.log(jobs.data);
var finishedJobs = await getFinishedSlurmJobInfo();
console.log(finishedJobs.data[0]);
res = await cancelSlurmJob(res.data);
console.log(res);
