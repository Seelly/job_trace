// 域名到公司名称的映射表
const DOMAIN_COMPANY_MAP = {
  // 字节跳动
  "bytedance.com": "字节跳动",
  "douyin.com": "字节跳动",
  "toutiao.com": "字节跳动",
  "feishu.cn": "字节跳动",
  "volcengine.com": "字节跳动",

  // 腾讯
  "tencent.com": "腾讯",
  "qq.com": "腾讯",
  "weixin.qq.com": "腾讯",
  "wechat.com": "腾讯",
  "gtimg.com": "腾讯",

  // 小米
  "xiaomi.com": "小米",
  "mi.com": "小米",
  "miui.com": "小米",
  "mioffice.cn": "小米",
  "mioffice.com": "小米",

  // 阿里巴巴
  "alibaba.com": "阿里巴巴",
  "taobao.com": "阿里巴巴",
  "tmall.com": "阿里巴巴",
  "aliyun.com": "阿里巴巴",
  "alibabacloud.com": "阿里巴巴",
  "1688.com": "阿里巴巴",
  "alicdn.com": "阿里巴巴",
  "alipay.com": "蚂蚁集团",
  "antgroup.com": "蚂蚁集团",

  // 百度
  "baidu.com": "百度",
  "bdstatic.com": "百度",

  // 京东
  "jd.com": "京东",
  "jdcloud.com": "京东",
  "360buy.com": "京东",

  // 美团
  "meituan.com": "美团",
  "dianping.com": "美团",
  "sankuai.com": "美团",

  // 拼多多
  "pinduoduo.com": "拼多多",
  "pdd.com": "拼多多",

  // 网易
  "163.com": "网易",
  "netease.com": "网易",
  "126.com": "网易",
  "yeah.net": "网易",

  // 快手
  "kuaishou.com": "快手",
  "ksyun.com": "快手",
  "gifshow.com": "快手",

  // 滴滴
  "didiglobal.com": "滴滴",
  "didichuxing.com": "滴滴",
  "xiaojukeji.com": "滴滴",

  // 华为
  "huawei.com": "华为",
  "vmall.com": "华为",
  "hicloud.com": "华为",

  // OPPO/vivo/荣耀
  "oppo.com": "OPPO",
  "vivo.com": "vivo",
  "honor.com": "荣耀",
  "honor.cn": "荣耀",
  "hihonor.com": "荣耀",

  // 携程
  "ctrip.com": "携程",
  "trip.com": "携程",

  // 哔哩哔哩
  "bilibili.com": "哔哩哔哩",
  "biligame.com": "哔哩哔哩",

  // 小红书
  "xiaohongshu.com": "小红书",
  "xhscdn.com": "小红书",

  // 知乎
  "zhihu.com": "知乎",
  "zhimg.com": "知乎",

  // 新浪/微博
  "sina.com.cn": "新浪",
  "sina.com": "新浪",
  "weibo.com": "微博",

  // 搜狐
  "sohu.com": "搜狐",

  // 360
  "360.cn": "360",
  "360.com": "360",
  "qihoo.com": "360",
  "so.com": "360",

  // 顺丰
  "sf-express.com": "顺丰",
  "sf-tech.com.cn": "顺丰科技",

  // 唯品会
  "vip.com": "唯品会",
  "vipshop.com": "唯品会",

  // 爱奇艺
  "iqiyi.com": "爱奇艺",
  "qiyi.com": "爱奇艺",

  // 优酷
  "youku.com": "优酷",

  // 去哪儿
  "qunar.com": "去哪儿",

  // 58同城
  "58.com": "58同城",
  "58.cn": "58同城",

  // 贝壳找房
  "ke.com": "贝壳找房",
  "lianjia.com": "链家",

  // 得物
  "dewu.com": "得物",
  "poizon.com": "得物",

  // 蔚来
  "nio.com": "蔚来",
  "nio.cn": "蔚来",

  // 理想汽车
  "lixiang.com": "理想汽车",

  // 小鹏汽车
  "xiaopeng.com": "小鹏汽车",
  "xpeng.com": "小鹏汽车",

  // 比亚迪
  "byd.com": "比亚迪",
  "bydauto.com.cn": "比亚迪",

  // 吉利
  "geely.com": "吉利",

  // 大疆
  "dji.com": "大疆",

  // 商汤科技
  "sensetime.com": "商汤科技",

  // 旷视科技
  "megvii.com": "旷视科技",

  // 依图科技
  "yitutech.com": "依图科技",

  // 云从科技
  "cloudwalk.com": "云从科技",

  // 科大讯飞
  "iflytek.com": "科大讯飞",

  // 海康威视
  "hikvision.com": "海康威视",

  // 大华股份
  "dahuatech.com": "大华股份",

  // 中兴通讯
  "zte.com.cn": "中兴通讯",

  // 联想
  "lenovo.com": "联想",
  "lenovo.com.cn": "联想",

  // 海尔
  "haier.com": "海尔",
  "haier.net": "海尔",

  // 格力
  "gree.com": "格力",

  // 美的
  "midea.com": "美的",

  // 万科
  "vanke.com": "万科",

  // 恒大
  "evergrande.com": "恒大",

  // 碧桂园
  "bgy.com.cn": "碧桂园",

  // 融创
  "sunac.com.cn": "融创",

  // 中国平安
  "pingan.com": "中国平安",
  "pa18.com": "中国平安",

  // 中国人寿
  "chinalife.com.cn": "中国人寿",

  // 招商银行
  "cmbchina.com": "招商银行",

  // 工商银行
  "icbc.com.cn": "工商银行",

  // 建设银行
  "ccb.com": "建设银行",

  // 农业银行
  "abchina.com": "农业银行",

  // 中国银行
  "boc.cn": "中国银行",

  // 交通银行
  "bankcomm.com": "交通银行",

  // 中信银行
  "citicbank.com": "中信银行",

  // 浦发银行
  "spdb.com.cn": "浦发银行",

  // 民生银行
  "cmbc.com.cn": "民生银行",

  // 兴业银行
  "cib.com.cn": "兴业银行",

  // 光大银行
  "cebbank.com": "光大银行",

  // 中国移动
  "10086.cn": "中国移动",
  "chinamobile.com": "中国移动",

  // 中国联通
  "10010.com": "中国联通",
  "chinaunicom.com": "中国联通",

  // 中国电信
  "189.cn": "中国电信",
  "chinatelecom.com.cn": "中国电信",

  // 国家电网
  "sgcc.com.cn": "国家电网",

  // 中石油
  "cnpc.com.cn": "中石油",

  // 中石化
  "sinopec.com": "中石化",

  // 招聘平台
  "zhipin.com": "BOSS直聘",
  "lagou.com": "拉勾网",
  "liepin.com": "猎聘",
  "51job.com": "前程无忧",
  "zhaopin.com": "智联招聘",
  "linkedin.com": "LinkedIn",

  // 外企
  "google.com": "Google",
  "microsoft.com": "Microsoft",
  "apple.com": "Apple",
  "amazon.com": "Amazon",
  "meta.com": "Meta",
  "facebook.com": "Meta",
  "netflix.com": "Netflix",
  "tesla.com": "Tesla",
  "nvidia.com": "NVIDIA",
  "intel.com": "Intel",
  "amd.com": "AMD",
  "ibm.com": "IBM",
  "oracle.com": "Oracle",
  "salesforce.com": "Salesforce",
  "adobe.com": "Adobe",
  "cisco.com": "Cisco",
  "dell.com": "Dell",
  "hp.com": "HP",
  "sap.com": "SAP",
  "vmware.com": "VMware",
  "redhat.com": "Red Hat",
  "uber.com": "Uber",
  "airbnb.com": "Airbnb",
  "spotify.com": "Spotify",
  "twitter.com": "Twitter",
  "snap.com": "Snap",
  "zoom.us": "Zoom",
  "slack.com": "Slack",
  "shopify.com": "Shopify",
  "stripe.com": "Stripe",
  "paypal.com": "PayPal",
  "ebay.com": "eBay",
  "booking.com": "Booking.com",
  "expedia.com": "Expedia"
};

/**
 * 根据 URL 匹配公司名称
 * @param {string} url - 职位页面的 URL
 * @returns {string} 公司名称，匹配不到返回空字符串
 */
function getCompanyNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // 移除 www. 前缀
    const domain = hostname.replace(/^www\./, "");

    // 精确匹配
    if (DOMAIN_COMPANY_MAP[domain]) {
      return DOMAIN_COMPANY_MAP[domain];
    }

    // 模糊匹配：检查域名是否包含关键词
    for (const [key, company] of Object.entries(DOMAIN_COMPANY_MAP)) {
      if (domain.includes(key.split(".")[0])) {
        return company;
      }
    }

    return "";
  } catch (error) {
    return "";
  }
}
