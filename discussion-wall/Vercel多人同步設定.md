# Vercel 多人留言雲端同步設定

留言牆已改成 Vercel 架構：

- 網站：Vercel Hosting
- 後端：Vercel Functions，路徑為 `/api/boards`
- 資料庫：Vercel Marketplace 的 KV／Upstash Redis

## 1. 從 GitHub 匯入 Vercel

1. 打開 <https://vercel.com/new>
2. 選擇 GitHub repo：`sunny680228/ai-workflow-site`
3. Framework Preset 選 `Other`
4. Root Directory 保持專案根目錄
5. Deploy

## 2. 建立 Vercel 資料庫

1. 進入 Vercel 專案
2. 點 `Storage`
3. 新增 Marketplace 資料庫，建議選 `Upstash Redis` 或 Vercel KV 相容服務
4. 連結到這個專案

完成後，Vercel 會自動加入環境變數：

```txt
KV_REST_API_URL
KV_REST_API_TOKEN
```

如果沒有自動加入，請到 `Settings` → `Environment Variables` 手動新增。

## 3. 重新部署

資料庫連好後，請重新部署一次：

1. 進入 Vercel 專案
2. 點 `Deployments`
3. 選最新部署
4. 點 `Redeploy`

## 4. 上課使用

1. 打開 Vercel 網址的留言牆頁面
2. 按「新白板」
3. 複製網址列中含有 `?board=...` 的完整網址給學生
4. 學生用同一個網址進入，就會進同一張白板

## 5. 狀態判斷

- `雲端同步：已同步`：資料已寫入 Vercel 後端。
- `雲端同步：讀取白板失敗`：通常是資料庫環境變數尚未設定。
- `storage: memory`：代表 API 暫時用記憶體模式，重啟後資料會消失。
- `storage: vercel-kv`：代表已接上 Vercel KV／Upstash，資料會保留。
