import puppeteer from "puppeteer";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import axios from "axios";
import { chunk, get, isEmpty, uniq, uniqBy } from "lodash-es";
import { writeFile } from "./fs";
import { upsert } from "./supabase";
import { feed, stock_info, getSheetFistColumnsData } from "./feishu";

const feed_news_link = process.env.FEED_NEWS_LINK || "";
const feed_news_link_us = process.env.FEED_NEWS_LINK_US || "";
const feed_more_info_link = process.env.FEED_MORE_INFO_LINK || "";
const feed_detail_info_link = process.env.FEED_DETAIL_INFO_LINK || "";
const feed_more_info_link_us = process.env.FEED_MORE_INFO_LINK_US || "";
const feed_detail_info_link_us = process.env.FEED_DETAIL_INFO_LINK_US || "";
const isDev = process.env.is_dev === "true";

const PLATFORM = {
  normal: "normal",
  us: "us",
};

let timeout_record: { counter_ids: string[]; platform: string }[] = [];

let current_stocks: any = [];
let feed_list: any = [];
export const getDetailInfo = async (
  counter_ids: string[],
  platform: string
) => {
  current_stocks = [];
  feed_list = [];

  let start_time = Date.now();
  try {
    const browser = await puppeteer.launch();
    // 并发请求 将 counter_ids 分组
    const group_counter_ids = chunk(counter_ids, 10);
    for (const counter_ids of group_counter_ids) {
      for (const counter_id of counter_ids) {
        await goDetail(browser, counter_id, platform);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await browser.close();
  } catch (error) {
    console.log("🚀 ~ getDetail broker ~ error :", error);
    timeout_record.push({ counter_ids, platform });
  }

  try {
    current_stocks = uniqBy(current_stocks, "symbol");
    console.log("🚀 ~ upsert ~ current_stocks:", current_stocks.length);
    await upsert(current_stocks);

    feed_list = uniqBy(feed_list, "id");
    console.log("🚀 ~ upsert ~ feed_list:", feed_list.length);
    await upsert(feed_list, "feed");
  } catch (error) {
    console.log("🚀 ~ upsert ~ error:", error);
  }
  console.log(`🚀 ~ getDetail ~ time:`, Date.now() - start_time);
  return { current_stocks, feed_list };
};

const goDetail = async (browser: any, counter_id: string, platform: string) => {
  const page = await browser.newPage();

  // Inject code to capture the global variable before it is deleted
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, "__INITIAL_STATE__", {
      get: function () {
        return this.INITIAL_STATE;
      },
      set: function (value) {
        this.INITIAL_STATE = value;
      },
      configurable: true,
    });
  });

  if (platform === PLATFORM.normal && !feed_news_link) {
    return;
  }
  if (platform === PLATFORM.us && !feed_news_link_us) {
    return;
  }

  // Navigate the page to a URL.
  await page.goto(
    platform === PLATFORM.normal
      ? feed_news_link.replace("{{counter_id}}", counter_id)
      : feed_news_link_us.replace("{{counter_id}}", counter_id),
    {
      waitUntil: "networkidle2",
    }
  );

  try {
    // @ts-ignore
    const capturedValue = await page.evaluate(() => window.INITIAL_STATE);

    // you could get all stock_info you want from capturedValue
    if (isDev) {
      writeFile(capturedValue, `src/backup/news_rank/${counter_id}.json`);
    }

    const stock_base = get(capturedValue, "stock_info", {});

    if (platform === PLATFORM.normal) {
      const stock_info = {
        symbol: counter_id,
        update_at: new Date(),
        turnover: get(stock_base, "turnover", ""),
        turnover_num: convertToNumber(get(stock_base, "turnover", "")),
        volume: get(stock_base, "volume", ""),
        volume_num: convertToNumber(get(stock_base, "volume", "")),
        total_shares: get(stock_base, "totalShares", ""),
        total_shares_num: convertToNumber(get(stock_base, "totalShares", "")),
      };

      current_stocks.push(stock_info);
    }

    const stock_news = get(capturedValue, "stock_news.list", []);

    // get stock_news feed_info
    for (const item of stock_news) {
      const { type, id } = extractTypeAndId(item.url);
      if (type && id) {
        const feed_detail = await getFeedDetail(counter_id, id, type, platform);
        let info = {
          ...feed_detail,
          counter_id,
          type,
          id: Number(id),
          title: item.title,
          time: new Date(item.time * 1000),
          url: item.url,
          source: item.source,
          platform,
        };
        feed_list.push(info);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (!isEmpty(feed_list)) {
      if (isDev) {
        writeFile(
          feed_list,
          `src/backup/news_rank/${counter_id}_feed_list.json`
        );
      }
    }
  } catch (error) {
    console.log("🚀 ~ goDetail ~ error:", error);
  }
};

async function getFeedDetail(
  counter_id: string,
  id: string,
  type: string,
  platform: string
) {
  if (!feed_detail_info_link && platform === PLATFORM.normal) {
    return {};
  }
  if (!feed_detail_info_link_us && platform === PLATFORM.us) {
    return {};
  }
  const detail_info_link =
    platform === PLATFORM.normal
      ? feed_detail_info_link
      : feed_detail_info_link_us;
  const more_info_link =
    platform === PLATFORM.normal ? feed_more_info_link : feed_more_info_link_us;

  const params = {
    id,
    type,
    commentCount: 50,
    allowShowComment: 1,
    allowShowLike: 1,
    _t: Date.now(),
  };
  try {
    const more = await axios({
      method: "GET",
      url: `${more_info_link
        .replace("{{id}}", id)
        .replace("{{type}}", type)
        .replace("{{t}}", Date.now().toString())}`,
      params,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "image",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-origin",
        cookie: "locale=zh-hk;",
        Referer: `${more_info_link
          .replace("{{id}}", id)
          .replace("{{type}}", type)
          .replace("{{t}}", Date.now().toString())}`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const res = await axios({
      method: "GET",
      url: detail_info_link,
      params,
    });
    const more_data = get(more, "data.data", {});
    const data = get(res, "data.data", {});
    if (!more_data.viewCountShow) {
      console.log(
        "🚀 ~ more_data:",
        "-",
        id,
        "-",
        type,
        "-",
        get(more_data, "hot.length", 0)
      );
    }
    const feed_detail = {
      view_count: more_data.viewCountShow || 0,
      share_count: data.shareCount || 0,
      like_count: data?.like?.likedNum || 0,
      comment_count: data.commentCount || 0,
    };
    return feed_detail;
  } catch (e: any) {
    console.log("🚀 ~ getFeedDetail ~ e:", e);
    return {};
  }
}

// 使用正则表达式从 URL 中提取 TYPE 和 ID
function extractTypeAndId(url: string) {
  const match = url.match(/\/([^\/]+)\/(\d+)/);
  if (match) {
    return { type: match[1], id: match[2] };
  } else {
    return { type: null, id: null };
  }
}

function extractId(url: string) {
  // 正则表达式匹配模式
  const pattern = /\/stock\/([A-Z0-9]+-[A-Z]+)/;
  const match = url.match(pattern);
  if (match) {
    return match[1];
  }
  return null;
}

// 将格式化后的大数字字符串转换为数字
function convertToNumber(formattedStr: string) {
  const units = {
    万: 10 ** 4,
    百万: 10 ** 6,
    千万: 10 ** 7,
    亿: 10 ** 8,
    十亿: 10 ** 9,
    百亿: 10 ** 10,
    千亿: 10 ** 11,
    万亿: 10 ** 12,
  };

  for (let unit in units) {
    if (formattedStr.includes(unit)) {
      const numberStr = formattedStr.replace(unit, "");
      const number = parseFloat(numberStr) * units[unit as keyof typeof units];
      return Math.round(number);
    }
  }

  // 如果没有单位，直接返回原始数字
  return Math.round(parseFloat(formattedStr));
}

// 使用 yargs 解析命令行参数
const argv = yargs(hideBin(process.argv))
  .option("counter_ids", {
    alias: "d",
    type: "string",
    describe: "JSON formatted data",
    coerce: (arg) => {
      try {
        return arg.split(",").filter(Boolean);
      } catch (e) {
        return [];
      }
    },
  })
  .option("force", {
    alias: "f",
    type: "string",
    describe: "Force update list",
    default: false,
  })
  .help().argv;
// @ts-ignore
let counter_ids = argv.counter_ids || [];

if (counter_ids.length <= 0) {
  try {
    const sheet = await getSheetFistColumnsData("NShpk9");
    const stock_links = sheet.map((item: any) =>
      get(item, "0.0.link", get(item, "0.0.text", ""))
    );
    counter_ids = stock_links.map((item: any) => extractId(item));
  } catch (error) {
    console.log("🚀 ~ counter_ids ~ error:", error);
  }
}

counter_ids = uniq(counter_ids.filter(Boolean));

if (counter_ids.length > 0) {
  timeout_record = [];
  for (const platform of Object.values(PLATFORM)) {
    await getDetailInfo(counter_ids, platform);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await feed();
  await stock_info();

  if (timeout_record.length > 0) {
    for (const item of timeout_record) {
      await getDetailInfo(item.counter_ids, item.platform);
    }
  }
}
