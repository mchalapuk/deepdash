#!/bin/sh
cd $(dirname $0)
find app lib -iname "*.tsx" -or -iname "*.ts" -or -iname "*.css" -or -iname "*.shader" | \
  xargs egrep -cv '^[ \t]*$' | \
  awk 'BEGIN{FS=":";printf("%10s %s\n", "LoC","FILE")}{total=total+$2;printf("%10s %s\n", $2, $1)}END{printf("%10s %s\n", total, "TOTAL")}'

