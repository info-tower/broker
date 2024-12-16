import type { Client } from "@larksuiteoapi/node-sdk";
import { loginUser, supabase } from "./supabase";

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

// 清除 sheet
async function clearSheet(sheetId: string) {
  // https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet-sheet/get
  let meta_res = await client.request({
    url: `${baseURL}/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/${sheetId}`,
    method: "GET",
  });

  const { row_count } = meta_res?.data?.sheet?.grid_properties || {};

  console.log(`--> will clear sheet: ${sheetId} count: ${row_count}`);

  // clear sheet
  await client.request({
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
  console.log(`--> clear sheet: ${sheetId} done!`);
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

const args = process.argv.slice(2);
if (args.length > 0) {
  await loginUser();
  switch (args[0]) {
    case "feed":
      await clearSheet(feedSheetId);
      await update_feishu_table();
      break;
    case "stock_info":
      await clearSheet(stockSheetId);
      await update_feishu_table1();
      break;
    default:
      console.log("未知的命令参数");
      break;
  }
} else {
  console.log(
    "bun run ./src/broker.ts feed 或 bun run ./src/broker.ts stock_info"
  );
}
