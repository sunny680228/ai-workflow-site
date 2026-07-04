# Firebase 多人留言雲端同步設定

這份留言牆已經接好 Firebase Cloud Firestore。還沒貼 Firebase 設定碼時，會維持「本機模式」；貼好設定碼並開啟 Firestore 後，就會變成多人即時同步。

## 1. 建立 Firebase 專案

1. 打開 Firebase Console：<https://console.firebase.google.com/>
2. 點選「建立專案」。
3. 專案名稱可以用：`sunny-discussion-wall`
4. Google Analytics 可以先關閉，教學留言牆不一定需要。

## 2. 建立 Web App

1. 進入專案後，點選 `</>` Web 圖示。
2. App 暱稱可以用：`大聲說出來互動討論牆`
3. 完成後，Firebase 會給一段 `firebaseConfig`。
4. 把那段設定貼到 `index.html` 的這一段：

```js
const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
```

只要把空字串換成 Firebase 給你的值即可。

## 3. 開啟 Cloud Firestore

1. 左側選單點「建構」→「Firestore Database」。
2. 點「建立資料庫」。
3. 位置可選離台灣近的區域，例如 `asia-east1` 或 Firebase 建議的亞洲區域。
4. 規則模式可先選「正式版模式」，再貼下面的教學用規則。

## 4. 設定教學用規則

這個留言牆支援匿名留言，所以課堂使用時需要允許公開讀寫。請到 Firestore 的「規則」貼上：

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /sunny-discussion-wall-boards/{boardId} {
      allow read, create, update, delete: if true;

      match /notes/{noteId} {
        allow read, create, update, delete: if true;
      }
    }
  }
}
```

提醒：這是課堂快速使用規則，適合短期活動。正式長期公開使用時，建議再加上登入、App Check 或管理員權限。

## 5. 測試同步

1. 用電腦開留言牆。
2. 用手機或另一個瀏覽器開同一個網址。
3. 新增便利貼、改名、移動、縮放、釘選、表情回饋。
4. 右側如果顯示「雲端同步：已同步」，代表 Firestore 已經接上。

## 6. 上課操作建議

- 每一次講課按「新白板」，就會產生新的課程版面。
- 課程結束按「存檔」，保留當次留言。
- 若要清掉舊課程，從右側課程存檔刪除即可。
- 學員不需要登入，直接開網址就能匿名留言。
