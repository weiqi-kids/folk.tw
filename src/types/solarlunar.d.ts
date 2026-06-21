// solarlunar 之型別在 package.json exports 下無法解析；此處宣告本專案使用之最小介面。
declare module 'solarlunar' {
  interface Solar2LunarResult {
    lYear: number;
    lMonth: number;
    lDay: number;
    isLeap: boolean;
    gzYear: string;
    gzMonth: string;
    gzDay: string;
    term?: string | false;
  }
  interface SolarLunar {
    solar2lunar(y: number, m: number, d: number): Solar2LunarResult;
  }
  const solarlunar: SolarLunar;
  export default solarlunar;
}
