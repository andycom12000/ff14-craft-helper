#!/bin/bash
set -e
RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir ../public/solver-wasm
# Remove wasm-pack generated .gitignore so files can be committed
rm -f ../public/solver-wasm/.gitignore
