# slurmjs

在 JavaScript 中调用 Slurm 命令行工具的轻量封装。底层通过 `squeue`、`sbatch`、`scancel`、`sinfo`、`sacct`、`scontrol` 与集群交互，并将 JSON 输出整理为统一的数据结构。

## 环境要求

- [Bun](https://bun.com) 运行时
- 已配置并可用的 Slurm 环境（上述命令需在 PATH 中）

## 安装

```bash
bun install
# or npm install
```

## 快速开始

```javascript
import {
  getSlurmJobInfo,
  submitSlurmJob,
  cancelSlurmJob,
  getSlurmClusterInfo,
  getFinishedSlurmJobInfo,
  updateSlurmNodeState,
} from "./index.js";

// 查看集群分区信息
const cluster = await getSlurmClusterInfo();
console.log(cluster.data);

// 提交作业
const { data: jobId } = await submitSlurmJob("test/test.slurm");

// 查看队列中的作业
const jobs = await getSlurmJobInfo();
console.log(jobs.data);

// 查看已结束作业
const finished = await getFinishedSlurmJobInfo();
console.log(finished.data);

// 取消作业
await cancelSlurmJob(jobId);

// 修改节点状态（需管理员权限）
await updateSlurmNodeState("node01", "DRAIN", "maintenance");
await updateSlurmNodeState("node01", "RESUME");
```

项目内示例脚本：

```bash
bun test/test.js
```

## API

所有函数均为 `async`，返回统一结构：

```javascript
// 成功
{ success: true, data: ... }

// 失败
{ success: false, error: "错误信息" }
```

### 命令行参数 `kwargs`

各函数均接受可选的 `kwargs` 对象，会转换为 Slurm 命令行参数：

- 键名长度大于 1：加 `--` 前缀，如 `{ json: "" }` → `--json`
- 键名长度为 1：加 `-` 前缀，如 `{ u: "liuxy" }` → `-u liuxy`

### `getSlurmJobInfo(kwargs?)`

调用 `squeue --json`，返回当前队列中的作业列表。


| 字段            | 说明                                                                     |
| ------------- | ---------------------------------------------------------------------- |
| `jobId`       | 作业 ID                                                                  |
| `account`     | 账户                                                                     |
| `user`        | 提交用户                                                                   |
| `status`      | 作业状态                                                                   |
| `cluster`     | 集群名                                                                    |
| `nodes`       | 运行节点                                                                   |
| `cpus`        | CPU 数                                                                  |
| `memory`      | 每节点内存                                                                  |
| `gres`        | GPU 等资源详情                                                              |
| `partition`   | 分区                                                                     |
| `timeLimit`   | 时间限制（分钟）                                                               |
| `submitTime`  | 提交时间（`Date`）                                                           |
| `startTime`   | 开始时间（`Date`）                                                           |
| `runningTime` | 运行时长（[dayjs Duration](https://day.js.org/docs/en/durations/durations)） |
| `name`        | 作业名                                                                    |


### `submitSlurmJob(jobScript, kwargs?)`

调用 `sbatch` 提交作业脚本。

- `jobScript`：`.slurm` 脚本路径
- 成功时 `data` 为新建作业的 ID（`number`）

### `cancelSlurmJob(jobId, kwargs?)`

调用 `scancel` 取消指定作业。

- `jobId`：要取消的作业 ID
- 成功时 `data` 为空字符串

### `getSlurmClusterInfo(kwargs?)`

调用 `sinfo --json`，返回集群分区与节点信息。


| 字段             | 说明         |
| -------------- | ---------- |
| `name`         | 分区名        |
| `availability` | 分区可用状态     |
| `memory`       | 最大内存       |
| `disk`         | 最大磁盘       |
| `cpus`         | 最大 CPU 数   |
| `gres`         | 资源总量       |
| `state`        | 节点状态       |
| `nodes`        | 节点列表       |
| `time_limit`   | 最大时间限制（分钟） |


### `getFinishedSlurmJobInfo(kwargs?)`

调用 `sacct --json`，返回已结束（非 `RUNNING`）的作业记录。


| 字段           | 说明           |
| ------------ | ------------ |
| `jobId`      | 作业 ID        |
| `account`    | 账户           |
| `user`       | 提交用户         |
| `cluster`    | 集群名          |
| `name`       | 作业名          |
| `partition`  | 分区           |
| `stdout`     | 标准输出路径       |
| `stderr`     | 标准错误路径       |
| `exitCode`   | 退出码          |
| `workDir`    | 工作目录         |
| `status`     | 最终状态         |
| `submitTime` | 提交时间（`Date`） |
| `startTime`  | 开始时间（`Date`） |
| `endTime`    | 结束时间（`Date`） |


### `updateSlurmNodeState(nodeName, state, reason?, kwargs?)`

调用 `scontrol update` 修改节点状态。通常需要管理员权限。

- `nodeName`：节点名，支持 Slurm 节点列表表达式（如 `node[01-03]`）
- `state`：目标状态，常见值包括 `IDLE`、`DOWN`、`DRAIN`、`RESUME` 等
- `reason`：可选原因说明；设置 `DOWN` / `DRAIN` 时通常需要提供
- 成功时 `data` 为空字符串

```javascript
await updateSlurmNodeState("node01", "DRAIN", "hardware check");
await updateSlurmNodeState("node01", "RESUME");
```

