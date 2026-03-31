declare module "tz-lookup" {
  /** Returns an IANA time zone name for the given WGS84 coordinates (synchronous, bundled data). */
  function tzlookup(latitude: number, longitude: number): string;
  export default tzlookup;
}
