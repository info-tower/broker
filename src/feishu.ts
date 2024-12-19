import type { Client } from "@larksuiteoapi/node-sdk";
import { loginUser, supabase } from "./supabase";
import { get } from "lodash-es";

const lark = require("@larksuiteoapi/node-sdk");

// 开发者复制该 Demo 后，需要修改 Demo 里面的"app id", "app secret"为自己应用的 appId, appSecret
const client: Client = new lark.Client({
  appId: "cli_a7d536c4229a900e",
  appSecret: process.env.LARK_APP_SECRET || "",
  disableTokenCache: false,
});

let spreadsheetToken = "FgTGsrqe7hh0Ivt7fTUc6SRAn7b";
let baseURL = "https://open.feishu.cn/open-apis/";
let feedSheetId = "af3f6c";
const max_clear_count = 4500;

function splitBySize(total: number, size: number) {
  const result = [];
  while (total > 0) {
    if (total >= size) {
      result.push(size);
      total -= size;
    } else {
      result.push(total);
      total = 0;
    }
  }
  return result;
}
// 清除 sheet
async function clearSheet(sheetId: string) {
  // https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet-sheet/get
  let meta_res = await client.request({
    url: `${baseURL}/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/${sheetId}`,
    method: "GET",
  });

  const { row_count } = meta_res?.data?.sheet?.grid_properties || {};

  console.log(`--> will clear sheet: ${sheetId} count: ${row_count}`);

  // 根据 row_count 分组
  const group_count = splitBySize(row_count, max_clear_count);

  // 批量 clear sheet
  for (const count of group_count) {
    try {
      await postClearSheet(sheetId, count);
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.log("🚀 ~ clearSheet ~ error:", error);
    }
  }

  console.log(`--> clear all sheet: ${sheetId} done!`);
}

async function postClearSheet(sheetId: string, row_count: number) {
  const res = await client.request({
    url: `${baseURL}/sheets/v2/spreadsheets/${spreadsheetToken}/dimension_range`,
    method: "DELETE",
    data: {
      dimension: {
        sheetId,
        startIndex: 2,
        majorDimension: "ROWS",
        endIndex: row_count,
      },
    },
  });
  console.log(`--> clear sheet: ${sheetId} done! ${get(res, "code")}`);
}

// 获取 sheet 数据
async function getSheetData(range: string) {
  let res = await client.request({
    url: `${baseURL}/sheets/v2/spreadsheets/${spreadsheetToken}/values/${range}`,
    method: "GET",
  });

  let result = res?.data?.valueRange?.values || [];
  return result;
}

export async function getSheetFistColumnsData(sheetId: string) {
  let meta_res = await client.request({
    url: `${baseURL}/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/${sheetId}`,
    method: "GET",
  });
  const { row_count } = meta_res?.data?.sheet?.grid_properties || {};

  let range = `${sheetId}!A2:Z${row_count}`;
  return await getSheetData(range);
}

// 插入行列
// https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/prepend-data
async function prependData(sheetId: string, data: any[]) {
  let res = await client.request({
    url: `${baseURL}/sheets/v2/spreadsheets/${spreadsheetToken}/values_prepend`,
    method: "POST",
    data: {
      valueRange: {
        range: `${sheetId}!A2:Z999`,
        values: data,
      },
    },
  });

  const { updatedRange, updatedColumns, updatedRows } =
    res?.data?.updates || {};

  console.log(
    `--> insert rows success updatedRange: ${updatedRange} updatedColumns: ${updatedColumns} updatedRows: ${updatedRows}`
  );
}

let current_page = 1;
let limit = 300;
let feed_accumulate = 0;
let callCount = 0;
let lastCallTime = Date.now();

async function update_feishu_table() {
  // 限制每秒最多 80 次调用
  const now = Date.now();
  if (now - lastCallTime >= 1000) {
    callCount = 0;
    lastCallTime = now;
  }

  if (callCount >= 80) {
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 - (now - lastCallTime))
    );
    return update_feishu_table();
  }

  callCount++;

  let start = 0;
  if (current_page != 1) {
    start = (current_page - 1) * limit + 1;
  }
  let end = current_page * limit;
  console.log(`--> fetch sources start: ${start} end: ${end}`);

  let { data: data1 = [], error } = await supabase
    .from("feed")
    .select("*")
    .limit(limit)
    .range(start, end);
  let data = data1 || [];

  if (data.length > 0) {
    current_page++;
    feed_accumulate = feed_accumulate + data.length;
    let feishu_data = data.map((item: any) => {
      return Object.values(item);
    });
    await prependData(feedSheetId, feishu_data);
    await update_feishu_table();
  } else {
    console.log("--> fetch sources done! count: ", feed_accumulate);
  }
}

let current_page1 = 1;
let limit1 = 300;
let feed_accumulate1 = 0;
let callCount1 = 0;
let lastCallTime1 = Date.now();
let stockSheetId = "g3KYL5";

async function update_feishu_table1() {
  // 限制每秒最多 80 次调用
  const now = Date.now();
  if (now - lastCallTime1 >= 1000) {
    callCount1 = 0;
    lastCallTime1 = now;
  }

  if (callCount >= 80) {
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 - (now - lastCallTime1))
    );
    return update_feishu_table1();
  }

  callCount1++;

  let start = 0;
  if (current_page1 != 1) {
    start = (current_page1 - 1) * limit1 + 1;
  }
  let end = current_page1 * limit1;
  console.log(`--> fetch sources start: ${start} end: ${end}`);

  let { data: data1 = [], error } = await supabase
    .from("stock_info")
    .select("*")
    .limit(limit1)
    .range(start, end);
  let data = data1 || [];

  if (data.length > 0) {
    current_page1++;
    feed_accumulate1 = feed_accumulate1 + data.length;
    let feishu_data = data.map((item: any) => {
      return Object.values(item);
    });
    await prependData(stockSheetId, feishu_data);
    await update_feishu_table1();
  } else {
    console.log("--> fetch sources done! count: ", feed_accumulate1);
  }
}

export async function feed() {
  await loginUser();
  await clearSheet(feedSheetId);
  await update_feishu_table();
}

export async function stock_info() {
  await loginUser();
  await clearSheet(stockSheetId);
  await update_feishu_table1();
}

await clearSheet(feedSheetId);

// const args = process.argv.slice(2);
// if (args.length > 0) {
//   switch (args[0]) {
//     case "feed":
//       await feed();
//       break;
//     case "stock_info":
//       await stock_info();
//       break;
//     default:
//       console.log("未知的命令参数");
//       break;
//   }
// } else {
// console.log(
//   "bun run ./src/broker.ts feed 或 bun run ./src/broker.ts stock_info"
// );
// }
