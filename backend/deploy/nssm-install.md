# Windows 部署 (NSSM)

在 Windows Server 上用 [NSSM](https://nssm.cc/) 把后端装成服务，重启/崩溃会自动拉起。

## 前置

- Python 3.10+ 已安装，`python` 在 PATH 里
- 项目部署在 `C:\ultrasound\backend`，已执行 `pip install -r requirements.txt`、`python scripts/init_db.py`、`python scripts/init_admin.py --user-id admin --password 'xxxx'`
- 下载 `nssm.exe`，放到 `C:\ultrasound\`

## 安装服务

```cmd
C:\ultrasound\nssm.exe install UltrasoundBackend ^
    "C:\ultrasound\backend\venv\Scripts\uvicorn.exe" ^
    app.main:app --host 0.0.0.0 --port 8000

C:\ultrasound\nssm.exe set UltrasoundBackend AppDirectory C:\ultrasound\backend
C:\ultrasound\nssm.exe set UltrasoundBackend AppEnvironmentExtra ^
    PYTHONUNBUFFERED=1 LOG_FORMAT=json COOKIE_SECURE=false

C:\ultrasound\nssm.exe set UltrasoundBackend AppStdout C:\ultrasound\logs\out.log
C:\ultrasound\nssm.exe set UltrasoundBackend AppStderr C:\ultrasound\logs\err.log
C:\ultrasound\nssm.exe set UltrasoundBackend AppRotateFiles 1
C:\ultrasound\nssm.exe set UltrasoundBackend AppRotateBytes 10485760

net start UltrasoundBackend
```

## 常见操作

```cmd
net stop UltrasoundBackend
net start UltrasoundBackend
C:\ultrasound\nssm.exe restart UltrasoundBackend
C:\ultrasound\nssm.exe remove UltrasoundBackend confirm
```

## 开机自启

`nssm install` 默认就是 Automatic，如果要改：

```cmd
C:\ultrasound\nssm.exe set UltrasoundBackend Start SERVICE_AUTO_START
```
