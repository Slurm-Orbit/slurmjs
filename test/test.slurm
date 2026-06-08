#!/bin/bash
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
