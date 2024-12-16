import puppeteer from "puppeteer";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import axios from "axios";
import { writeFile } from "../fs";
import { upsert } from "../supabase";
import { get, isEmpty } from "lodash-es";

const feed_news_link = process.env.FEED_NEWS_LINK || "";
const feed_detail_info_link = process.env.FEED_DETAIL_INFO_LINK || "";
const isDev = process.env.is_dev === "true";

let stock_feed_detail: Record<string, any> = {};
export const getDetailInfo = async (counter_ids: string[]) => {
  let info = {
    done: false,
  };
  let start_time = Date.now();
  try {
    const browser = await puppeteer.launch();
    await Promise.all(
      counter_ids.map((counter_id) => goDetail(browser, counter_id))
    );

    await browser.close();
  } catch (error) {
    console.log("🚀 ~ getDetail broker ~ error :", error);
  }
  console.log(`🚀 ~ getDetail ~ time:`, Date.now() - start_time);
  return info;
};

const goDetail = async (browser: any, counter_id: string) => {
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

  if (!feed_news_link) {
    return;
  }

  // Navigate the page to a URL.
  await page.goto(feed_news_link.replace("{{counter_id}}", counter_id), {
    waitUntil: "networkidle2",
  });

  try {
    // @ts-ignore
    const capturedValue = await page.evaluate(() => window.INITIAL_STATE);

    // you could get all stock_info you want from capturedValue
    if (isDev) {
      writeFile(capturedValue, `src/backup/news_rank/${counter_id}.json`);
    }

    const stock_base = get(capturedValue, "stock_info", {});

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

    try {
      await upsert(stock_info);
    } catch (error) {
      console.log("🚀 ~ goDetail ~ error:", error);
    }

    const stock_news = get(capturedValue, "stock_news.list", []);

    stock_feed_detail = {};
    let feed_list = [];
    // get stock_news feed_info
    for (const item of stock_news) {
      const { type, id } = extractTypeAndId(item.url);
      if (type && id) {
        const feed_detail = await getFeedDetail(counter_id, id, type);
        let info = {
          ...feed_detail,
          counter_id,
          type,
          id: Number(id),
          title: item.title,
          time: new Date(item.time * 1000),
          url: item.url,
          source: item.source,
        };
        stock_feed_detail[`${counter_id}_${type}_${id}`] = info;
        feed_list.push(info);
        await new Promise((resolve) => setTimeout(resolve, 300)); // 延迟 300ms
      }
    }

    if (!isEmpty(feed_list)) {
      if (isDev) {
        writeFile(
          feed_list,
          `src/backup/news_rank/${counter_id}_feed_list.json`
        );
      }
      try {
        for (const feed_item of feed_list) {
          await upsert(feed_item, "feed");
        }
      } catch (error) {
        console.log("🚀 ~ upsert feed error:", error);
      }
    }
  } catch (error) {
    console.log("🚀 ~ goDetail ~ error:", error);
  }
};

async function getFeedDetail(counter_id: string, id: string, type: string) {
  if (!feed_detail_info_link) {
    return {};
  }
  const params = {
    id,
    type,
    commentCount: 50,
    allowShowComment: 1,
    allowShowLike: 1,
    _t: Date.now(),
  };
  try {
    const res = await axios({
      method: "GET",
      url: feed_detail_info_link,
      params,
    });
    const data = get(res, "data.data", {});
    const feed_detail = {
      view_count: data.viewCount || 0,
      share_count: data.shareCount || 0,
      like_count: data?.like?.likedNum || 0,
      comment_count: data.commentCount || 0,
    };
    stock_feed_detail[`${counter_id}_${type}_${id}`] = feed_detail;
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
const counter_ids = argv.counter_ids || [];
// @ts-ignore
const force = argv.force === "true";

console.log("🚀 ~ counter_ids:", counter_ids);
if (counter_ids.length > 0) {
  getDetailInfo(counter_ids);
}
