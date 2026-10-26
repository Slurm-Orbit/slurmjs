# slurmjs

在 JavaScript 中调用 Slurm 命令行工具的轻量封装。底层通过 `squeue`、`sbatch`、`scancel`、`sinfo`、`sacct`、`sstat`、`scontrol`、`sacctmgr` 与集群交互，并将输出整理为统一的数据结构。

命令通过 `spawnSync` 直接执行（不经过 shell），所有函数均为 ESM 导出。

## 环境要求

- [Bun](https://bun.com)（运行测试）或 Node.js 18+
- 已配置并可用的 Slurm 环境（上述命令需在 `PATH` 中）

## 安装

```bash
bun install
# or npm install
```

## 快速开始

```javascript
import {
  getSlurmVersion,
  getSlurmClusterInfo,
  submitSlurmJob,
  holdSlurmJob,
  releaseSlurmJob,
  getSlurmQueueInfo,
  getSlurmJobStat,
  getSlurmJobInfo,
  cancelSlurmJob,
  updateSlurmNodeState,
  getSlurmAccountInfo,
} from "./index.js";

// Slurm 版本，例如 "25.11.2"
const version = await getSlurmVersion();

// 集群分区 / 节点信息
const cluster = await getSlurmClusterInfo();
console.log(cluster);

// 提交作业，返回作业 ID（number）
const jobId = await submitSlurmJob("job.slurm");

// 挂起 / 释放作业
await holdSlurmJob(jobId);
await releaseSlurmJob(jobId);

// 查看队列中的作业
const jobs = await getSlurmQueueInfo();
const job = jobs.find((j) => j.jobId === jobId);
console.log(job?.status);

// 查看运行中作业的 step 统计（字段名使用 sstat 的 --format 字段）
const stats = await getSlurmJobStat(jobId, ["JobID", "NTasks", "MaxRSS", "AveCPU"]);
console.log(stats);

// 查看作业会计记录（sacct）
const accounting = await getSlurmJobInfo();
console.log(accounting);

// 查看会计账户
const accounts = await getSlurmAccountInfo();
console.log(accounts);

// 取消作业
await cancelSlurmJob(jobId);

// 修改节点状态（需管理员权限）
await updateSlurmNodeState("node01", "DRAIN");
await updateSlurmNodeState("node01", "RESUME");
```

运行测试：

```bash
bun test
```

## API

所有函数均为 `async`。成功时返回数据，失败时抛出 `Error`（信息在 `error.message`）。

### 选项参数 `options`

除 `getSlurmJobStat` 的 `target` 外，各函数末尾都可传一个可选的 `options` 对象，其**键名**会转换为 Slurm 命令行开关：

- 键名长度大于 1：加 `--` 前缀，如 `{ all: "" }` → `--all`
- 键名长度为 1：加 `-` 前缀，如 `{ a: "" }` → `-a`

> 当前实现只读取键名，**值会被忽略**，因此只能用于无值的开关参数。
>
> ```javascript
> await getSlurmQueueInfo({ all: "" });   // squeue --json --all
> await getSlurmJobInfo({ a: "" });       // sacct --json -a
> ```

### 错误处理

- 命令的 `stderr` 非空且包含 `error:` 时，截取 `error:` 之后的内容抛错。
- 命令退出码非 0 且 `stderr` 为空时，抛出 `Command <command> failed with exit code <code>`。
- 命令不存在时，抛出底层 `spawnSync` 的执行错误（Bun 下信息包含 `not found`）。

### `getSlurmVersion()`

调用 `sinfo --version`，返回版本字符串（如 `"25.11.2"`）。

### `getSlurmQueueInfo(options?)`

调用 `squeue --json`，返回当前队列中的作业列表（`Array`）。

| 字段            | 类型                                                                       | 说明                                     |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `jobId`       | `number`                                                                 | 作业 ID                                  |
| `account`     | `string`                                                                 | 账户，未设置时为空字符串                           |
| `user`        | `string`                                                                 | 提交用户                                   |
| `status`      | `string[]`                                                               | 作业状态，如 `["RUNNING"]`                    |
| `cluster`     | `string`                                                                 | 集群名                                    |
| `nodes`       | `string`                                                                 | 运行节点                                   |
| `cpus`        | `number`                                                                 | CPU 数                                  |
| `memory`      | `number`                                                                 | 每节点内存（MB）                              |
| `gres`        | `string[]`                                                               | GPU 等资源详情，如 `["gpu:rtx4090d:1(IDX:0)"]` |
| `partition`   | `string`                                                                 | 分区                                     |
| `timeLimit`   | `number`                                                                 | 时间限制（分钟）                               |
| `submitTime`  | `Date \| null`                                                           | 提交时间                                   |
| `startTime`   | `Date \| null`                                                           | 开始时间，未开始为 `null`                        |
| `runningTime` | [dayjs Duration](https://day.js.org/docs/en/durations/durations)         | 运行时长                                   |
| `name`        | `string`                                                                 | 作业名                                    |

### `getSlurmClusterInfo(options?)`

调用 `sinfo --json`，返回集群分区与节点信息（`Array`）。

| 字段             | 类型         | 说明                          |
| -------------- | ---------- | --------------------------- |
| `name`         | `string`   | 分区名                         |
| `availability` | `string[]` | 分区可用状态，如 `["UP"]`            |
| `memory`       | `number`   | 最大内存（MB）                    |
| `disk`         | `number`   | 最大磁盘                        |
| `cpus`         | `number`   | 最大 CPU 数                    |
| `gres`         | `string`   | 资源总量，如 `"gpu:rtx4090d:8"`     |
| `state`        | `string[]` | 节点状态，如 `["IDLE"]`            |
| `nodes`        | `string[]` | 节点名列表                       |
| `time_limit`   | `number`   | 最大时间限制（分钟），无限制时为 `0`        |

### `submitSlurmJob(jobScript, options?)`

调用 `sbatch` 提交作业脚本。

- `jobScript`：`.slurm` 脚本路径
- 成功时返回新建作业的 ID（`number`）

> 注意：当前实现把 `options` 生成的开关放在脚本路径之后，`sbatch` 会将其视为脚本参数，因此提交时无法通过 `options` 附加 `sbatch` 参数。

### `cancelSlurmJob(jobId, options?)`

调用 `scancel` 取消指定作业。

- `jobId`：要取消的作业 ID
- 无返回值

### `holdSlurmJob(jobId, options?)`

调用 `scontrol hold`，阻止待调度作业启动。

- `jobId`：单个作业 ID
- 无返回值

### `releaseSlurmJob(jobId, options?)`

调用 `scontrol release`，释放此前 hold 的作业。

- `jobId`：单个作业 ID
- 无返回值

> Slurm 的状态切换是异步的：`release` 之后作业可能仍短暂显示为 `PENDING`（等待调度周期或资源回收）。需要确认状态时请轮询 `getSlurmQueueInfo()`，不要立即断言。

### `getSlurmJobStat(jobId, target, options?)`

调用 `sstat --allsteps --parsable2 --format=<target> --jobs=<jobId>`，返回运行中作业 step 的资源统计。

- `jobId`：作业 ID
- `target`：字段名数组，原样传给 `--format`，常用字段包括 `JobID`、`NTasks`、`MaxRSS`、`AveRSS`、`MaxVMSize`、`AveVMSize`、`AveCPU`、`MinCPU`、`MaxDiskRead`、`AveDiskRead`、`MaxDiskWrite`、`AveDiskWrite`、`ConsumedEnergy`、`AllocTRES`
- 返回值为**以字段名为键的扁平对象**，值均为字符串，例如：

  ```javascript
  await getSlurmJobStat(123, ["JobID", "NTasks", "MaxRSS"]);
  // { JobID: "123.batch", NTasks: "1", MaxRSS: "" }
  ```

- 仅对 `RUNNING` 作业有效；作业不存在或未运行时 `sstat` 会在 `stderr` 报错并抛错
- `sstat` 只输出表头（字段没有数据）时返回 `{}`

### `getSlurmJobInfo(options?)`

调用 `sacct --json`，返回作业会计记录（`Array`）。

| 字段           | 类型             | 说明             |
| ------------ | -------------- | -------------- |
| `jobId`      | `number`       | 作业 ID          |
| `account`    | `string`       | 账户             |
| `user`       | `string`       | 提交用户           |
| `cluster`    | `string`       | 集群名            |
| `name`       | `string`       | 作业名            |
| `partition`  | `string`       | 分区             |
| `stdout`     | `string`       | 标准输出路径，未设置时为空字符串 |
| `stderr`     | `string`       | 标准错误路径，未设置时为空字符串 |
| `exitCode`   | `number`       | 退出码            |
| `workDir`    | `string`       | 工作目录           |
| `status`     | `string[]`     | 当前状态，如 `["RUNNING"]` |
| `submitTime` | `Date \| null` | 提交时间           |
| `startTime`  | `Date \| null` | 开始时间，未开始为 `null` |
| `endTime`    | `Date \| null` | 结束时间，未结束为 `null` |

### `updateSlurmNodeState(nodeName, state, options?)`

调用 `scontrol update NodeName=<nodeName> State=<state>` 修改节点状态。通常需要管理员权限。

- `nodeName`：节点名，支持 Slurm 节点列表表达式（如 `node[01-03]`）
- `state`：目标状态，常见值包括 `IDLE`、`DOWN`、`DRAIN`、`RESUME` 等
- 无返回值

```javascript
await updateSlurmNodeState("node01", "DRAIN");
await updateSlurmNodeState("node01", "RESUME");
```

### `getSlurmAccountInfo(options?)`

调用 `sacctmgr list account --json`，查询账户列表（`Array`）。

| 字段             | 类型         | 说明   |
| -------------- | ---------- | ---- |
| `name`         | `string`   | 账户名  |
| `description`  | `string`   | 描述   |
| `organization` | `string`   | 组织   |
| `flags`        | `string[]` | 标志位  |

### `addSlurmAccount(name, parent?, description?, options?)`

调用 `sacctmgr add account name=<name> parent=<parent> description=<description> --immediate` 创建账户。通常需要管理员权限。

- 返回 `sacctmgr` 的标准输出（已 `trim`）

```javascript
await addSlurmAccount("project_a", "root", "Project A");
```

### `modifySlurmAccount(where, set, options?)`

调用 `sacctmgr modify account where name=<where> set description=<set> --immediate`。

- `where`：要修改的账户名
- `set`：新的描述
- 返回 `sacctmgr` 的标准输出（已 `trim`）

```javascript
await modifySlurmAccount("project_a", "updated");
```

### `deleteSlurmAccount(name, options?)`

调用 `sacctmgr delete account name=<name> --immediate`。

- 返回 `sacctmgr` 的标准输出（已 `trim`）

```javascript
await deleteSlurmAccount("project_a");
```
