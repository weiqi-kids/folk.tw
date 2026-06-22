// M3 農民曆 — 型別定義（對應附錄 C DayRecord）
//
// 確定性原則（C.0）：同一國曆日 → 唯一 DayRecord（時辰相關欄位除外，需真太陽時）。
// 凡標 verified:false 之欄位，依 §5 / C.4-5「未驗證不對外顯示」。

export interface GanZhi {
  stem: string; // 天干
  branch: string; // 地支
  /** 干支序 0..59（甲子=0） */
  index: number;
}

/** 帶出處與推導的考據化結論（C.6 差異化核心） */
export interface Sourced<T> {
  value: T;
  /** 判定它的值神／神煞與規則（C.6 derivation） */
  derivation?: string;
  /** 規則依據；《協紀辨方書》為基準，包含但不限於（C.6） */
  sources: string[];
  /** 規則表常數未校準前為 false → 不對外顯示（C.4-5） */
  verified: boolean;
}

/** 宜忌單筆考據化判定（C.7.7 DayVerdict） */
export interface DayVerdict {
  affair: string; // 事項（祭祀/嫁娶/動土…）
  judgement: '宜' | '忌';
  derivation: { shensha: string; verdict: '宜' | '忌'; weight?: string }[];
  resolvedBy: string; // 從違裁決說明（C.7.6）
  sources: string[];
  verified: boolean;
}

export interface DayRecord {
  /** 國曆 ISO 日（UTC+8 曆算基準，C.8） */
  solar: string;
  jdn: number;

  /** 農曆（需官方天文資料：定朔/中氣/閏月，C.2 S2） */
  lunar: Sourced<{ year: number; month: number; day: number; isLeap: boolean } | null>;

  /** 節氣（需官方天文資料，C.2 S3） */
  solarTerm: Sourced<{ name: string; isTransitionDay: boolean } | null>;

  /** 四柱干支（C.2 S4）。年/月柱依節氣分界，故與 solarTerm 同 verified 條件 */
  pillars: {
    year: Sourced<GanZhi | null>;
    month: Sourced<GanZhi | null>;
    day: Sourced<GanZhi>; // 日柱僅依 JDN，最先可驗
    hour: Sourced<GanZhi | null>; // 需真太陽時，C.6 列發佈後增補
  };

  /** 建除十二神（C.2 S5） */
  jianchu: Sourced<string | null>;
  /** 廿八宿（C.2 S6） */
  ershiba: Sourced<string | null>;
  /** 黃黑道十二神 + 吉凶（C.2 S7） */
  huangHeiDao: Sourced<{ name: string; auspicious: boolean } | null>;

  /** 宜（C.2 S9，考據化） */
  yi: DayVerdict[];
  /** 忌（C.2 S9，考據化） */
  ji: DayVerdict[];

  /** 沖煞：對沖生肖 + 煞方（C.2 S10） */
  chongSha: Sourced<{ zodiac: string; direction: string } | null>;
  /** 胎神占方（C.2 S10） */
  taiShen: Sourced<string | null>;
  /** 吉時（C.2 S10，需真太陽時） */
  jiShi: Sourced<string[]>;

  /** 七十二候：節氣物候（《月令七十二候集解》，C 豐化） */
  wuHou: Sourced<{ term: string; hou: string; phenology: string } | null>;
  /** 彭祖百忌：日干支民俗口訣（諸說並陳，非指示語） */
  pengZu: Sourced<{ gan: string; zhi: string } | null>;
  /** 六十甲子納音五行（依日干支，《三命通會》） */
  naYin: Sourced<string | null>;
  /** 月相（依農曆日近似：朔/上弦/望/下弦…） */
  moonPhase: string | null;
  /** 節氣倒數：距上一/下一節氣日數 */
  termCountdown: { prevName: string; sinceDays: number; nextName: string; untilDays: number } | null;

  /** 節日（固定農曆節 + 節氣節） */
  festivals: string[];
  /** 神明聖誕[]：join Deity.birthday_lunar，用具名實例（C.3 / B.3-1） */
  deityBirthdays: { deityId: string; name: string }[];

  /** 整體曆算狀態：是否在有效年限內、天文資料是否已接（C.8 有效年限） */
  status: {
    inRange: boolean;
    /** 天文資料來源是否已接（定朔/節氣）。未接前農曆/節氣/年月柱 verified=false */
    astronomicalDataConnected: boolean;
    note?: string;
  };
}
