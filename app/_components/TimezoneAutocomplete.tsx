"use client";

import { Autocomplete } from "@mantine/core";
import { useMemo, useState } from "react";
import { getSupportedTimeZones } from "@/lib/timezones";

export function TimezoneAutocomplete() {
  const [value, setValue] = useState("");
  const data = useMemo(() => [...getSupportedTimeZones()], []);

  return (
    <Autocomplete
      label="IANA time zone"
      placeholder="Search time zones"
      data={data}
      value={value}
      onChange={setValue}
      limit={40}
    />
  );
}
