#!/bin/bash
exec /bin/bash "$(cd -- "$(dirname -- "$0")" && pwd -P)/scripts/LanguagePack.sh" --restore "$@"
