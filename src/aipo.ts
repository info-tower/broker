import type { Client } from "@larksuiteoapi/node-sdk";
import { get } from "lodash-es";
const lark = require("@larksuiteoapi/node-sdk");

// 开发者复制该 Demo 后，需要修改 Demo 里面的"app id", "app secret"为自己应用的 appId, appSecret
const client: Client = new lark.Client({
  appId: "cli_a7d536c4229a900e",
  appSecret: process.env.LARK_APP_SECRET || "",
  disableTokenCache: false,
});

// https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/list?appId=cli_a7d536c4229a900e get token
let spreadsheetToken = "SqBhsHUiJhp42pt0mA5cwvUrnFd";
let baseURL = "https://open.feishu.cn/open-apis";

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

  // data: {
  //   sheet: {
  //     grid_properties: {
  //       column_count: 21,
  //       frozen_column_count: 0,
  //       frozen_row_count: 0,
  //       row_count: 29192,
  //     },
  //     hidden: false,
  //     index: 0,
  //     resource_type: "sheet",
  //     sheet_id: "af3f6c",
  //     title: "xxxxx",
  //   },
  // },
  const { row_count } = meta_res?.data?.sheet?.grid_properties || {};

  // 根据 row_count 分组
  const group_count = splitBySize(row_count, max_clear_count);

  // 批量 clear sheet
  for (const count of group_count) {
    try {
      await postClearSheet(sheetId, count);
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.log("🚀 ~ clearSheet ~ error:", error);
      throw error;
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

let callCount = 0;
let lastCallTime = Date.now();

export const API = {
  fetch: async (url: string, options: any) => {
    if (options.params) {
      const params = new URLSearchParams(options.params);
      url = `${url}?${params.toString()}`;
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      return { err: true, data: {} };
    }
    return res.json();
  },
};


enum TimeRange {
  WEEK = 1,
  MONTH = 2,
}

enum StockType {
  // 综合
  All = 0,
  // 正股
  Stock = 1,
}

const query_mapping = {
  "af3f6c": [TimeRange.WEEK, StockType.All],
  "HkfQgg": [TimeRange.WEEK, StockType.Stock],
  "nIYTHf": [TimeRange.MONTH, StockType.All],
  "XRN8ac": [TimeRange.MONTH, StockType.Stock],
}

const getByCurrentConfig = async (params = {}) => {
  const resp = await API.fetch("https://aipo.myiqdii.com/Home/GetTurnoverChangeInfo", {
    params,
    method: "GET",
  });

  if (!resp.err) {
    return get(resp, "data.dataList", []);
  }else {
    return [];
  }
};


async function update_feishu_table(params: { stockType: string, type: string, sheetId: string }) {
  let sheetId = params.sheetId;
  let apiParams = {
    stockType: params.stockType,
    type: params.type,
    pageIndex: 1,
    pageSize: 2000,
  }
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
    return update_feishu_table(params);
  }

  callCount++;

  let data = await getByCurrentConfig(apiParams);
  if (data.length > 0) {
    let feishu_data = data.map((item: any) => {
      // raw_data =  {
      //   exchangerTraderId: "A00003",
      //   shortName: "xxxx",
      //   turnover: 62655100000,
      //   ranking: 1,
      //   hsiTurnoverRate: 169.2781744841691,
      //   tradeDate: "2025-02-26T00:00:00",
      //   changeRanking: 0,
      //   updatedOn: "2025-02-26T16:49:48.763",
      // }

      item.turnover = (item.turnover / 10**6).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      item.hsiTurnoverRate = item.hsiTurnoverRate.toFixed(2) + "%";
      item.tradeDate = item.tradeDate.split("T")[0];
      item.updatedOn = item.updatedOn.replace("T", " ").split(".")[0];
      
      return [
        item.ranking,
        item.changeRanking,
        item.shortName,
        item.turnover,
        item.hsiTurnoverRate,
        item.tradeDate,
        item.updatedOn,
        item.exchangerTraderId
      ];
    });
    console.log(`--> update_feishu_table ~ count: ${feishu_data.length}`);
    await prependData(sheetId, feishu_data);
  } else {
    console.log(`--> fetch sources done! count: ${data.length}`);
  }
}

async function main() { 

  for (const [sheetId, [timeRange, stockType]] of Object.entries(query_mapping)) {
    await clearSheet(sheetId);
    await update_feishu_table({ stockType: stockType.toString(), type: timeRange.toString(), sheetId });
  }
}

main();