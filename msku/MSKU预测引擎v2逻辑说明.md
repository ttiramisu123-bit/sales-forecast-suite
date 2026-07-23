# EVIL ENERGY MSKU 销量预测引擎 v2 — 逻辑说明

> 版本：v2（近4月基准 + 五段差异化 + 轻SI + 绝对增量封顶）  
> 日期：2026-07-23  
> 适用范围：SKU 公式预测销量自动生成

---

## 目录

1. [整体预测链路](#1-整体预测链路)
2. [第一轮：数据清洗](#2-第一轮数据清洗)
3. [第二轮：近4月加权基准](#3-第二轮近4月加权基准)
4. [第三轮：五段差异化 + 趋势乘数](#4-第三轮五段差异化--趋势乘数)
5. [第四轮：轻SI季节性修正](#5-第四轮轻si季节性修正)
6. [第五轮：趋势延伸(钟形曲线) + 月环比封顶](#6-第五轮趋势延伸钟形曲线--月环比封顶)
7. [第六轮：优化层(近期刹车/奖励 + 五段护栏)](#7-第六轮优化层近期刹车奖励--五段护栏)
8. [尾部SKU特殊处理](#8-尾部sku特殊处理)
9. [参数总表](#9-参数总表)
10. [与旧版(v1)差异对比](#10-与旧版v1差异对比)

---

## 1. 整体预测链路

v2 预测链路分为 6 轮：

| 轮次 | 名称 | 作用 |
|------|------|------|
| 1 | 异常值清洗 | 去除异常高值、异常归零值 |
| 2 | 近4月加权基准 | 只看近4月正销量，加权衰减（decay=0.85），不再看全历史 |
| 3 | 五段差异化 + 趋势乘数 | 段位判断 + 段位独立趋势乘数 |
| 4 | 轻SI季节性修正 | 非PTFE用 1+(rawSi-1)×0.3，PTFE保留原SI |
| 5 | 趋势延伸 + 月环比封顶 | 钟形曲线渐进过渡 + 绝对增量逐月衰减封顶 |
| 6 | 优化层(刹车/奖励 + 护栏) | 近期刹车压低下滑、渐进奖励增长、五段pos_avg封顶护栏 |

最终公式预测经过第6轮后输出，再叠加人工调整形成最终预测。

---

## 2. 第一轮：数据清洗

与 v1 相同，包含两类异常值处理：

| 类型 | 判断逻辑 | 替换方式 |
|------|----------|----------|
| 异常高值 | 当前值同时高于历史基准倍数、邻近月份倍数 | 用左右邻近月份均值替换 |
| 异常归零 | 当前为 0，但邻近月份均值明显不低 | 用左右邻近月份均值替换 |

```text
有效销量 = MAX(0, 原始销量)
```

清洗后销量用于后续所有计算。

---

## 3. 第二轮：近4月加权基准

**v2 核心改动：只看近4月，前面不参考。**

### 3.1 加权均值

取清洗后序列最近 4 个月的窗口（先剥离异常值），按指数衰减加权：

```text
窗口数据 = stripAnomaliesFromWindow(cleaned, n-4, n)
加权均值 = Σ(value[i] × 0.85^(n-1-i)) / Σ(0.85^(n-1-i))
```

- decay = 0.85，越近的月份权重越大
- 若加权均值 ≤ 0，则 fallback 为窗口正销量简单均值

### 3.2 正销量均值 (positiveAvg)

```text
positiveAvg = 近4月加权均值  (若>0)
            或 清洗后全序列正销量均值  (若窗口不够4月)
```

positiveAvg 是后续所有计算的基准起点，包括段位判断、趋势均值、封顶护栏等。

---

## 4. 第三轮：五段差异化 + 趋势乘数

### 4.1 段位判断

基于 positiveAvg（近4月加权均值）：

| 段位 | 条件 | 中文 |
|------|------|------|
| head | ≥ 50 | 头部 |
| midhi | 30 ~ 50 | 中上 |
| mid | 15 ~ 30 | 中部 |
| midlo | 5 ~ 15 | 中下 |
| tail | < 5 | 尾部 |

### 4.2 段位参数 (SEG_PARAMS)

每个段位有独立参数，控制刹车、奖励、趋势乘数、影响力度：

| 段位 | brakeLo | brakeHi | rewardMax | trendMult | influence |
|------|---------|---------|-----------|-----------|-----------|
| head | 0.55 | 1.15 | 0.04 | 1.02 | 0.35 |
| midhi | 0.40 | 1.10 | 0.03 | 1.01 | 0.45 |
| mid | 0.40 | 1.05 | 0.02 | 1.00 | 0.55 |
| midlo | 0.40 | 1.00 | 0.01 | 0.95 | 0.75 |
| tail | 0.35 | 1.00 | 0.00 | 0.88 | 1.00 |

- **trendMult**: 趋势乘数。头部微增1.02，尾部缩减0.88
- **influence**: 近期刹车影响力度。头部轻(0.35)，尾部全受(1.00)
- **rewardMax**: 渐进奖励上限。头部4%，尾部0%

### 4.3 趋势计算

与 v1 相同的 SKU趋势 + Type趋势 → 综合趋势框架，但乘以段位趋势乘数：

```text
SKU趋势 = 最近窗口均值 / 前一窗口均值（限制0.90~1.12）
Type趋势 = 同Type所有SKU汇总后计算（限制0.90~1.12）
综合趋势 = SKU趋势 × SKU权重 + Type趋势 × Type权重
趋势均值 = positiveAvg × 综合趋势 × trendMult
```

---

## 5. 第四轮：轻SI季节性修正

**v2 核心改动：非PTFE不直接用原始SI，只保留30%季节性波动。**

### 5.1 非PTFE（大部分SKU）

```text
seasonal = 1 + (rawSi - 1) × 0.3
isPeak = seasonal ≥ 1.05
```

- LIGHT_SI_FACTOR = 0.3
- rawSi 来自 SI 指数表（精确匹配 / 标准化匹配 / 全部默认）
- 效果：旺季原本SI=1.3 → seasonal=1.09（只有9%增长，而非30%）

### 5.2 PTFE Fitting Kits

```text
seasonal = 1 + (rawSi - 1) × rule.season（与v1相同）
isPeak = seasonal ≥ 1.12
```

PTFE品类保留原始SI季节权重，不受轻SI压缩。

---

## 6. 第五轮：趋势延伸(钟形曲线) + 月环比封顶

### 6.1 钟形曲线趋势延伸

**v2 核心改动：4个月数据→12月预测，趋势不能无限累积。**

前6月从基准渐进上升到趋势均值，后6月从趋势均值渐进回落到基准：

```text
前6月 (monthIdx < 6):
  blendFactor = (monthIdx + 1) / 6
  progressiveBase = positiveAvg × (1 - blendFactor) + trendAvg × blendFactor

后6月 (monthIdx ≥ 6):
  decayFactor = (monthIdx - 5) / 6
  progressiveBase = trendAvg × (1 - decayFactor) + positiveAvg × decayFactor
```

效果：第1月≈基准，第6月≈趋势均值，第12月≈基准，形成钟形曲线。

### 6.2 初始预测值

```text
initial = MAX(0, ROUND(progressiveBase × seasonal))
```

### 6.3 月环比封顶 — 绝对增量逐月衰减

**v2 核心改动：封顶不是封涨幅百分比，而是封每月允许新增的绝对销量，且逐月衰减。**

当 initial > previous 时：

```text
capped = MIN(initial, rateCap, growthCap)
```

其中 rateCap 和 growthCap 与v1相同（稳定度环比上限 + 历史平均正增长量）。

**新增绝对增量封顶**：

```text
segCapStart = { head: 20, midhi: 15, mid: 10, midlo: 5 }
startCap = segCapStart[segment] 或 3（tail兜底）
decayRate = (11 - monthIdx) / 11    // 第1月=1.0, 第12月≈0.0
maxUnits = MAX(1, ROUND(startCap × decayRate))
capped = MIN(capped, previous + maxUnits)
```

逐月衰减效果示例（head段位，startCap=20）：

| 预测月 | monthIdx | decayRate | maxUnits |
|--------|----------|-----------|----------|
| 第1月  | 0        | 1.00      | 20       |
| 第2月  | 1        | 0.91      | 18       |
| 第4月  | 3        | 0.73      | 15       |
| 第6月  | 5        | 0.55      | 11       |
| 第9月  | 8        | 0.27      | 5        |
| 第12月 | 11       | 0.00      | 1（兜底） |

当 initial ≤ previous 时（下滑侧）：

```text
capped = MAX(initial, previous × (1 - rule.down))
```

### 6.4 previous 起点

```text
previous初始值 = positiveAvg（近4月加权均值）
```

不用 cleaned[-1] 或 last_actual，避免单月异常值做起点导致过冲。

---

## 7. 第六轮：优化层(近期刹车/奖励 + 五段护栏)

### 7.1 近期刹车 (recentBrakeFactor)

**v2 核心改动：增长侧(ratio≥1)不再额外奖励，只在下滑时刹车压低。**

```text
若 recentRatio ≥ 1 → brakeFactor = 1（不放大）
若 recentRatio < 1 → brakeFactor = 1 + (brakeRatio - 1) × influence
  其中 brakeRatio = CLAMP(recentRatio, brakeLo, brakeHi)
```

### 7.2 渐进奖励 (recentGrowthRewardFactor)

**v2 核心改动：线性渐进，有段位上限。**

```text
若 recentRatio ≤ 1 → rewardFactor = 1（无奖励）
若 recentRatio > 1:
  excess = recentRatio - 1
  fraction = MIN(excess / 0.5, 1)      // 渐进线性，上限0.5
  rewardFactor = 1 + fraction × rewardMax  // 段位上限
```

各段 rewardMax: head=0.04, midhi=0.03, mid=0.02, midlo=0.01, tail=0.00

### 7.3 机会因子 (opportunityFactor)

```text
opportunityFactor = 1（固定）
```

v1曾用1.05给非尾部+5%，v2砍掉，防止4层增长因子连乘。

### 7.4 优化公式

```text
optimized = rawUnits × calibration × 1 × brakeFactor × rewardFactor
```

只有3个因子（calibration是校准比，来自历史数据拟合，通常≈1），不再是v1的4层连乘。

### 7.5 五段护栏 (基于pos_avg封顶)

**v2 核心改动：optimize护栏基于近4月均值(pos_avg)，而非raw units。**

| 段位 | 兜底 | 封顶上限 | 说明 |
|------|------|----------|------|
| head | ≥ rawUnits | ≤ posAvg × 1.12 | 销量越高涨幅越小 |
| midhi | ≥ raw × 0.98 | ≤ posAvg × 1.15 | |
| mid | ≥ raw × 0.95 | ≤ posAvg × 1.08 | |
| midlo | 特殊规则（见下） | | |
| tail | 已均衡（跳过brake/reward） | | |

**midlo 特殊规则**：
- 近2月无动销 + 历史总量≤0 → 归零
- 近2月无动销 + 历史月均值<3 → 收缩到 MAX(月均值×0.9, 2)
- 历史月均值<5 → 收缩到 MAX(近期加权×1.1, 2)

---

## 8. 尾部SKU特殊处理

**v2 核心改动：尾部不做趋势/SI，直接均衡出12月flat值。**

### 8.1 尾部预测值（flat均衡）

```text
tailBase = positiveAvg          // 直接用pos_avg，不做额外折扣
formulaUnits = roundTo1(tailBase)    // 允许小数，无兜底限制
```

**为什么不用间歇折扣**：positiveAvg 已经是含零月的真实均值（把不出单的月份也算进去了），再乘折扣是双重惩罚。直接用 pos_avg 更贴近真实出单水平。

12个月全部相同值（zero growth, zero volatility），季节性=1。可能出现 0.2、0.3、0.7、0.9 等小数值。

### 8.3 optimize层跳过

尾部在optimize层跳过 brake/reward，直接输出 roundTo1(optimized)。

---

## 9. 参数总表

### 9.1 全局常量

| 常量 | 值 | 说明 |
|------|----|------|
| LIGHT_SI_FACTOR | 0.3 | 非PTFE保留30%原SI |
| PROGRESSIVE_BLEND_MONTHS | 6 | 钟形曲线过渡月数 |
| IS_PEAK_THRESHOLD | 1.05 | 轻SI下旺季判定阈值 |
| 近4月衰减系数 | 0.85 | weightedMean衰减 |
| previous起点 | positiveAvg | 非cleaned[-1] |

### 9.2 五段SEG_PARAMS

| 段位 | 条件 | brakeLo | brakeHi | rewardMax | trendMult | influence |
|------|------|---------|---------|-----------|-----------|-----------|
| head | avg≥50 | 0.55 | 1.15 | 0.04 | 1.02 | 0.35 |
| midhi | avg≥30 | 0.40 | 1.10 | 0.03 | 1.01 | 0.45 |
| mid | avg≥15 | 0.40 | 1.05 | 0.02 | 1.00 | 0.55 |
| midlo | avg≥5 | 0.40 | 1.00 | 0.01 | 0.95 | 0.75 |
| tail | avg<5 | 0.35 | 1.00 | 0.00 | 0.88 | 1.00 |

### 9.3 绝对增量封顶参数 (segCapStart)

| 段位 | 第1月允许增量 | 逐月衰减至第12月 |
|------|---------------|-------------------|
| head | +20 | → +1（兜底） |
| midhi | +15 | → +1 |
| mid | +10 | → +1 |
| midlo | +5 | → +1 |
| tail | +3 | → +1（实际走flat逻辑） |

衰减公式：`maxUnits = MAX(1, ROUND(startCap × (11-monthIdx)/11))`

### 9.4 optimize五段pos_avg封顶

| 段位 | 封顶倍率 |
|------|----------|
| head | posAvg × 1.12 |
| midhi | posAvg × 1.15 |
| mid | posAvg × 1.08 |
| midlo | 特殊规则 |
| tail | 跳过 |

### 9.5 间歇性折扣 (TAIL_INTERMITTENT_DISCOUNTS)

| 近4月出单月数 | 折扣 |
|---------------|------|
| 0 | 0 |
| 1 | 0.8 |
| 2 | 0.9 |
| 3~4 | 0.95 |

---

## 10. 与旧版(v1)差异对比

| 维度 | v1 (旧版) | v2 (新版) | 改动原因 |
|------|-----------|-----------|----------|
| **基准** | 全历史正销量均值 | 近4月加权均值(decay=0.85) | 近期更有参考价值，远期权重降低 |
| **段位** | 无段位区分 | 五段(head/midhi/mid/midlo/tail) | 不同销量规模的SKU需要不同策略 |
| **趋势乘数** | 无 | 各段trendMult(1.02~0.88) | 头部微增、尾部缩减 |
| **SI** | 直接用原始SI | 非PTFE: 1+(rawSi-1)×0.3; PTFE保留原SI | 原SI波动太大导致月度跳变 |
| **趋势延伸** | 无(趋势直接乘到全年) | 钟形曲线(前6月升→后6月降) | 4月数据→12月预测，趋势不能无限累积 |
| **封顶** | 百分比封顶(月环比×1.06~1.12) | 绝对增量封顶(每月最多多出N个)，逐月衰减 | 销量越大增幅应越小，百分比封顶反而让大SKU增幅更高 |
| **previous起点** | cleaned[-1] 或 last_actual | positiveAvg | 避免单月异常值做起点导致过冲 |
| **刹车** | 增长侧也放大 | 增长侧返回1，只在下滑时压低 | 防止4层因子连乘 |
| **奖励** | 无 | 渐进线性+段位上限 | 增长SKU需要奖励，但有上限 |
| **机会因子** | 1.05(+5%) | 1(砍掉) | 防止4层因子连乘叠加 |
| **optimize护栏** | 基于raw units封顶 | 基于pos_avg封顶 | 防止optimize放大破坏computeRaw的封顶效果 |
| **尾部** | 与其他段位相同逻辑 | 12月flat=pos_avg（不做额外折扣），允许小数(无兜底限制) | pos_avg已含间歇性，再折扣是双重惩罚 |
| **小数** | maximumFractionDigits=0 | 尾部roundTo1无兜底(0.2、0.3等均可见)，getFinalUnits尾部保留1位小数 | 尾部SKU导出时不再被Math.round抹成整数 |

---

## 附录：预测流程图

```text
原始销量
  │
  ▼
[1] 清洗异常值
  │
  ▼
[2] 近4月加权基准 → positiveAvg
  │                    │
  ▼                    ▼
[3] 段位判断 → SEG_PARAMS     趋势计算 → trendAvg
  │                              │
  ▼                              │
[4] 轻SI → seasonal             │
  │                              │
  ├─ PTFE: 1+(rawSi-1)×season   │
  ├─ 其他: 1+(rawSi-1)×0.3      │
  │                              │
  ▼                              │
[5] 钟形曲线渐进过渡             │
  │  progressiveBase             │
  ▼                              │
  initial = progressiveBase × seasonal
  │
  ▼
  月环比封顶（绝对增量逐月衰减）
  │  capped
  ▼
[6] optimize层
  │  × calibration × brakeFactor × rewardFactor
  │  五段pos_avg封顶护栏
  ▼
  公式预测 (formulaUnits)
  │
  ▼
  + 人工调整 (SKU系数/Type目标/活动加量/直改)
  │
  ▼
  最终预测 (finalUnits)
```
