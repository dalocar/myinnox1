#!/bin/bash
# Double-click to stop MyInnoX1. Keep this file in its folder; make an alias for the Desktop.
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

/bin/bash "$dir/launcher.sh" stop
status=$?
if [ "$status" -ne 0 ]; then
  printf '\nMyInnoX1 did not stop cleanly (see the message above).\nPress Return to close this window.\n'
  read -r _
fi
exit "$status"
