#!/bin/bash
# Double-click to start MyInnoX1. Keep this file in its folder; make an alias for the Desktop.
unset CDPATH
self=${BASH_SOURCE[0]}
while [ -h "$self" ]; do
  target=$(readlink "$self") || break
  case $target in
    /*) self=$target ;;
    *) case $self in */*) self=${self%/*}/$target ;; *) self=$target ;; esac ;;
  esac
done
case $self in */*) dir=${self%/*} ;; *) dir=. ;; esac

/bin/bash "$dir/launcher.sh" start
status=$?
if [ "$status" -ne 0 ]; then
  printf '\nMyInnoX1 did not start (see the message above).\nPress Return to close this window.\n'
  read -r _
fi
exit "$status"
