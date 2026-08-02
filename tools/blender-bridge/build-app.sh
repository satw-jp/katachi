#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
repo_dir="${script_dir:h:h}"
output_app="${1:-${script_dir}/build/Hikari Blender Bridge.app}"
contents_dir="${output_app}/Contents"
module_cache="/private/tmp/hikari-blender-bridge-module-cache"

mkdir -p "${contents_dir}/MacOS" "${contents_dir}/Resources" "${module_cache}"
CLANG_MODULE_CACHE_PATH="${module_cache}" SWIFTPM_MODULECACHE_PATH="${module_cache}" swiftc \
  -module-cache-path "${module_cache}" \
  -framework AppKit \
  -o "${contents_dir}/MacOS/HikariBlenderBridge" \
  "${script_dir}/HikariBlenderBridge.swift"
cp "${script_dir}/Info.plist" "${contents_dir}/Info.plist"
cp "${repo_dir}/tools/blender/import_hikari_study.py" "${contents_dir}/Resources/import_hikari_study.py"
codesign --force --deep --sign - "${output_app}"
echo "${output_app}"
