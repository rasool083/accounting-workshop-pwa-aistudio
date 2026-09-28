import { isJalaliLeapYear, isValidJalaliDate, jalaliMonthDayBasis } from "../client/src/lib/accounting";

const mismatches: Array<{ year: number; core: boolean; picker: boolean }> = [];
for (let year = 1200; year <= 1500; year += 1) {
  const core = isJalaliLeapYear(year);
  const picker = jalaliMonthDayBasis(`${year}/12/01`) === 30;
  if (core !== picker) mismatches.push({ year, core, picker });
}

const result = {
  checkedYears: 301,
  mismatchCount: mismatches.length,
  firstMismatches: mismatches.slice(0, 20),
  core1403Day30: isValidJalaliDate(1403, 12, 30),
  core1404Day30: isValidJalaliDate(1404, 12, 30),
};
console.log(JSON.stringify(result, null, 2));
if (result.mismatchCount !== 0 || !result.core1403Day30 || result.core1404Day30) process.exitCode = 1;
