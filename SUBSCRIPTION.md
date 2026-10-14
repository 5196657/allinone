# سیستم اشتراک + ربات تلگرام

## فرمت کد (۸ کاراکتر)
مثال: `M7K2P9QX`

| حرف اول | پلن |
|---------|-----|
| M | ماهانه |
| Q | سه‌ماهه |
| Y | سالانه |
| L | مادام‌العمر |
| T | آزمایشی |

حروف و اعداد بدون ابهام: بدون 0 و O و 1 و I

## تولید کد در کنسول برنامه
```js
AIO_generateLicense('monthly')
AIO_generateLicense('quarterly')
AIO_generateLicense('yearly')
AIO_generateLicense('lifetime')
```

## ربات تلگرام
پوشه `telegram-license-bot` را ببین.
