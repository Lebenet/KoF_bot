#!/bin/bash

while true; do
  npx tsc --watch --preserveWatchOutput --incremental
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    # tsc exited normally, e.g. you killed it manually with pkill
    echo "tsc watcher exited normally (exit code 0), stopping restart."
    break
  else
    # crashed or exited with error: restart after a short delay
    echo "tsc watcher crashed (exit code $EXIT_CODE), restarting in 3 seconds..."
    sleep 3
  fi
done