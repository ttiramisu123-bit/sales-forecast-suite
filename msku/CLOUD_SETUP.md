# EVIL ENERGY 销售预测工作台云端部署说明

## 1. 发布网页到 GitHub Pages

1. 打开 https://github.com
2. 登录 GitHub 账号；没有账号就注册。
3. 右上角点 `+`，选择 `New repository`。
4. Repository name 填：`sales-forecast-console`
5. 选择 `Public`。
6. 点 `Create repository`。
7. 进入仓库后，点 `Add file` -> `Upload files`。
8. 上传以下文件和文件夹：
   - `index.html`
   - `app.js`
   - `styles.css`
   - `vendor/xlsx.full.min.js`
9. 保持 `vendor/xlsx.full.min.js` 这个路径不变。
10. 页面底部点 `Commit changes`。
11. 进入仓库 `Settings` -> `Pages`。
12. Source 选择 `Deploy from a branch`。
13. Branch 选择 `main`，Folder 选择 `/root`。
14. 点 `Save`。
15. 等 1-2 分钟，GitHub 会生成网页链接：
    `https://你的用户名.github.io/sales-forecast-console/`

这个链接可以发给别人。Public 仓库下，别人不需要登录 GitHub。

## 2. 创建 Google Sheet 版本库

1. 打开 https://sheets.google.com
2. 新建表格，命名：`销售预测云端版本库`
3. 第一个页签命名为：`versions`
4. 第一行填表头：
   - `version_id`
   - `saved_at`
   - `saved_by`
   - `note`
   - `drive_file_id`
   - `is_latest`
   - `base_version_id`
   - `size_bytes`
5. 从浏览器地址复制 Sheet ID：
   `https://docs.google.com/spreadsheets/d/这里是SheetID/edit`

## 3. 创建 Google Drive JSON 文件夹

1. 打开 https://drive.google.com
2. 新建文件夹：`sales_forecast_projects`
3. 打开文件夹。
4. 从地址栏复制文件夹 ID：
   `https://drive.google.com/drive/folders/这里是文件夹ID`

## 4. 部署 Apps Script Web App

1. 回到 Google Sheet。
2. 顶部菜单点 `扩展程序` -> `Apps Script`。
3. 删除默认代码。
4. 把 `apps-script-code.gs` 里的代码全部复制进去。
5. 修改代码顶部两个变量：

```js
const SHEET_ID = "你的 Google Sheet ID";
const DRIVE_FOLDER_ID = "你的 Drive 文件夹 ID";
```

6. 点保存。
7. 点右上角 `部署` -> `新建部署`。
8. 类型选择 `Web 应用`。
9. 配置：
   - 执行身份：`我`
   - 谁可以访问：测试阶段建议选 `知道链接的任何人`
10. 点 `部署`。
11. 第一次会要求授权，按提示选择 Google 账号并允许访问 Sheet 和 Drive。
12. 部署完成后复制 Web App URL：
    `https://script.google.com/macros/s/xxxx/exec`

## 5. 在工作台里配置云端接口

1. 打开 GitHub Pages 网页链接。
2. 左侧找到 `云端同步`。
3. 在 `Apps Script URL` 粘贴 Web App URL。
4. 填写保存人。
5. 点 `保存配置`。
6. 点 `测试连接`。
7. 如果显示连接成功，就可以使用：
   - `保存云端`
   - `导入最新`
   - `查看版本`

云端 URL 和保存人会保存在当前浏览器的 localStorage。换电脑后需要重新填写一次。

## 6. 团队使用流程

保存人：

1. 打开工作台网页。
2. 导入或加载项目。
3. 调整预测。
4. 填写版本备注。
5. 点 `保存云端`。

查看人：

1. 打开同一个 GitHub Pages 网页。
2. 点 `导入最新`。
3. 查看最新预测版本。

修改人：

1. 点 `导入最新`。
2. 修改预测。
3. 点 `保存云端`。
4. 系统会新增一个版本，不覆盖旧版本。

## 7. 权限建议

简单版：

- GitHub Pages 仓库：Public
- Apps Script：知道链接的任何人可访问
- Sheet / Drive：只由 Apps Script 所属账号管理

更安全版：

- GitHub Pages 仓库：Public
- Apps Script：仅组织内用户可访问
- 使用者需要登录公司 Google 账号

注意：GitHub Pages 的代码是公开的，不建议把敏感密钥写死在 `app.js`。当前方案使用页面输入 Apps Script URL，并保存到本地浏览器。

## 8. 常见问题

### 别人打开 GitHub Pages 需要登录 GitHub 吗？

不需要。Public 仓库的 GitHub Pages 可以直接访问。

### 别人需要登录 Google 吗？

取决于 Apps Script 权限：

- `知道链接的任何人`：通常不需要登录。
- `组织内用户`：需要登录组织 Google 账号。

### 保存云端失败怎么办？

检查：

1. Apps Script URL 是否正确。
2. Apps Script 是否部署为 Web App。
3. 访问权限是否允许当前用户访问。
4. Apps Script 顶部的 Sheet ID / Drive Folder ID 是否正确。
5. 第一次部署是否已经完成授权。

### 数据存在哪里？

- Google Sheet：只存版本索引。
- Google Drive：存完整项目 JSON。
- GitHub Pages：只存网页代码，不存预测数据。
