// lunar-javascript 無內建型別宣告；此處宣告本專案實際使用之最小介面。
declare module 'lunar-javascript' {
  export interface JieQi {
    getName(): string;
  }
  export interface Lunar {
    getYear(): number;
    getMonth(): number; // 閏月為負
    getDay(): number;
    getYearInGanZhiByLiChun(): string;
    getMonthInGanZhi(): string;
    getDayInGanZhi(): string;
    getJieQi(): string;
    getPrevJieQi(wholeDay?: boolean): JieQi | null;
    getZhiXing(): string;
    getXiu(): string;
    getDaySha(): string;
    getFestivals(): string[];
  }
  export interface Solar {
    getLunar(): Lunar;
  }
  export const Solar: {
    fromYmd(year: number, month: number, day: number): Solar;
  };
  export const Lunar: unknown;
}
