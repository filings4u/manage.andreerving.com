#!/usr/bin/env bash
# Prepare existing Andre Erving training recordings for Cloudflare Stream.
# Usage: bash scripts/prepare-course-videos.sh "input.mp4" "output_directory"
# Produces lossless stream-copy candidates for editorial review. This is NOT a
# quality-enhancement pass; edit at instructional boundaries before publishing.
set -euo pipefail
input="${1:?Input video required}"
out="${2:?Output directory required}"
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe is required" >&2; exit 1; }
mkdir -p "$out"
base="$(basename "${input%.*}" | tr -cs '[:alnum:]' '_')"
ffmpeg -hide_banner -loglevel error -y -i "$input" -map 0:v:0 -map '0:a?' -c copy -f segment -segment_time 240 -reset_timestamps 1 "$out/${base}_part_%02d.mp4"
failed=0
for clip in "$out"/*.mp4; do
  bytes="$(stat -c%s "$clip")"
  duration="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$clip")"
  printf '%s | %.1f MiB | %ss\n' "$(basename "$clip")" "$((bytes / 1048576))" "$duration"
  if (( bytes > 200*1024*1024 )); then
    echo "WARNING: Clip exceeds 200 MiB upload ceiling: $clip" >&2
    failed=1
  fi
done
if (( failed )); then
  echo "Re-encode oversized segments or use shorter cut points." >&2
  exit 1
fi
echo "Editorial and privacy reviews are required before LMS upload."
