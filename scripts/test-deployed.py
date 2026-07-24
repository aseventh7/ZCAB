#!/usr/bin/env python3
"""验证部署后的所有功能"""
import json
import urllib.request
import urllib.error

BASE = "https://zcab-d2g3mo1qqaf40aab1.service.tcloudbase.com/api"
TOKEN = None

def api_call(path, method="GET", body=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            try:
                return json.loads(text)
            except:
                return text
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode()}
    except Exception as e:
        return {"error": str(e)}

def login():
    global TOKEN
    r = api_call("/auth/login", "POST", {"username": "admin", "password": "admin123"})
    if r.get("code") == 0:
        TOKEN = r["data"]["token"]
        print(f"[OK] 登录成功")
        return True
    print(f"[FAIL] 登录失败: {r}")
    return False

def test_overview():
    """测试楼宇预览业主信息联动"""
    r = api_call("/rooms/overview", "GET")
    data = r.get("data", []) if isinstance(r, dict) else []
    total = len(data)
    has_owner_id = sum(1 for x in data if x.get("ownerId"))
    has_owner_name = sum(1 for x in data if x.get("ownerName"))
    is_shop = sum(1 for x in data if x.get("isShop"))
    print(f"[{'OK' if total>500 else 'FAIL'}] 楼宇预览房间总数: {total} (应≈600)")
    print(f"      有 ownerId: {has_owner_id}, 有 ownerName: {has_owner_name}, 门市: {is_shop}")

if __name__ == "__main__":
    print("=" * 70)
    print("德馨苑物业管理平台 - 部署后功能验证")
    print("=" * 70)
    if not login():
        exit(1)
    test_overview()
    print("验证完成")
