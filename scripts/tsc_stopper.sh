#!/bin/bash
CONTAINER_NAME="$1"

if [ -z "$CONTAINER_NAME" ]; then
  echo "Usage: $0 <container_name>"
  exit 1
fi

docker events \
  --filter "event=stop" \
  --filter "container=$CONTAINER_NAME" \
  --since 1s |
while read -r event; do
  echo ""
	echo "[$(date)] Container $CONTAINER_NAME stopped event received."

	# wait a moment before checking
	sleep 10

	# Check if container is still running
	if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" | grep -q true; then
		# echo "[$(date)] Container $CONTAINER_NAME is not running anymore. Cleaning up..."
		pkill -f "start_tsc"
		break
	else
		echo "[$(date)] Container $CONTAINER_NAME restarted, skipping cleanup."
	fi
done