# Relay on AWS — full setup

Start to finish, with the decisions that matter called out. Roughly 30 minutes,
most of it waiting for DNS.

---

## 1. Which region

**This is the single most important choice on the page.** The relay sits in the
middle of every command, so its distance from you is added to every one.

| Region | Code | From India |
|---|---|---|
| **Mumbai** | `ap-south-1` | **20–40 ms** ← use this |
| Singapore | `ap-southeast-1` | 60–80 ms (what Render gives you now) |
| N. Virginia | `us-east-1` | 200 ms+ — **worse than what you have** |

An instance cannot be moved between regions afterwards; you would rebuild. Pick
the region closest to where the rover actually drives, not to where you happen
to be reading this.

---

## 2. Which instance

The relay is a small Node process. The heaviest thing it does is forward camera
frames — QVGA JPEG at 5 fps is about 50 KB/s per viewer, which is nothing.
Memory during the **build** is the real constraint, not memory at runtime.

| Type | vCPU | RAM | ap-south-1 | Verdict |
|---|---|---|---|---|
| `t4g.nano` | 2 | 0.5 GB | ~$3/mo | Runs fine, but `npm install` can be killed by the OOM reaper. Needs swap. |
| **`t4g.micro`** | **2** | **1 GB** | **~$6/mo** | **Recommended.** Builds without drama, plenty of headroom. |
| `t4g.small` | 2 | 2 GB | ~$12/mo | Comfortable. Only worth it if you add more services. |
| `t3.micro` | 2 | 1 GB | free 12 mo | Take this if your account is new — x86, same RAM. |

`t4g` is Graviton (ARM). Node runs on ARM natively and it is ~20% cheaper than
the x86 equivalent. The only reason to pick `t3` is the free tier.

**Storage:** the default 8 GB gp3 is ample. Node plus dependencies is under
1 GB.

---

## 3. Launch it

EC2 → Launch instance.

| Setting | Value |
|---|---|
| Name | `roverapp-relay` |
| AMI | **Ubuntu Server 22.04 LTS** (or 24.04) |
| Architecture | **64-bit (Arm)** for `t4g`, **64-bit (x86)** for `t3` |
| Instance type | `t4g.micro` |
| Key pair | create one, download the `.pem`, keep it |
| Storage | 8 GB gp3 |

### Security group

A security group is a firewall. It has two halves, and only one of them needs
touching:

- **Inbound** — traffic arriving from the world. This is what you configure.
- **Outbound** — traffic the server sends out. AWS allows everything by
  default, which is what you want: the relay has to reach MongoDB and Let's
  Encrypt. **Leave it alone.**

#### The easy way — the launch wizard

Under **Network settings**, with *Create security group* selected, there are
three checkboxes. Set them exactly like this and you never touch a rules table:

| Checkbox | Setting |
|---|---|
| Allow SSH traffic from | tick, and change the dropdown to **My IP** |
| Allow HTTPS traffic from the internet | tick |
| Allow HTTP traffic from the internet | tick |

The SSH dropdown defaults to **Anywhere**. Change it. Port 22 open to the world
is found by scanners within minutes.

#### The manual way

EC2 → Security Groups → yours → **Inbound rules** → *Edit inbound rules* →
*Add rule*. Choosing **Type** fills in Protocol and Port for you, so **Source**
is the only other field:

| Type | Protocol | Port | Source | Why |
|---|---|---|---|---|
| SSH | TCP | 22 | **My IP** | Never `0.0.0.0/0`. |
| HTTP | TCP | 80 | Anywhere-IPv4 | **Required.** Let's Encrypt validates over plain HTTP before it will issue. |
| HTTPS | TCP | 443 | Anywhere-IPv4 | The relay itself. |

Save. Rules apply immediately, with no restart.

#### Checking it

Inbound should show exactly three rows — 22, 80, 443. Outbound should show one:
*All traffic → 0.0.0.0/0*, the default.

**Do not add a rule for 3000.** Node binds to loopback and Caddy is the only
thing facing the internet, so the rule would do nothing — and if it did work, it
would let clients skip TLS entirely.

Forgetting port 80 is the most common reason Caddy sits failing to get a
certificate, and the error it prints does not mention port 80.

---

## 4. Elastic IP

Allocate an Elastic IP and associate it with the instance.

Without one, the public IP changes every time the instance stops — and every
board, being flashed with a hostname that resolves to the old address, silently
stops working. It is free while attached to a running instance.

---

## 5. Point a domain at it

TLS is not optional here. The web console is served over HTTPS and browsers
refuse to open a `ws://` socket from an HTTPS page, so without a certificate the
browser client stops working entirely however well the firmware copes.

**If you own a domain:** add an `A` record for `relay.yourdomain.com` pointing
at the Elastic IP.

**If you do not:** [DuckDNS](https://duckdns.org) is free, takes two minutes,
and Let's Encrypt issues for it happily. You get `something.duckdns.org`.

Wait for it to resolve before continuing — Caddy will fail if the name does not
yet point at the box:

```bash
dig +short relay.yourdomain.com     # should print your Elastic IP
```

---

## 6. MongoDB

The relay needs `MONGODB_URI`. Whatever you use on Render carries over
unchanged.

**If you use Atlas, allowlist the instance.** Atlas → Network Access → Add IP
Address → the Elastic IP. This is easy to forget and the symptom is the relay
starting cleanly and then failing every request, because the connection is
refused at the database rather than at boot.

---

## 7. Install

SSH in and run the provisioning script:

```bash
ssh -i your-key.pem ubuntu@<elastic-ip>

sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/Ayushssss/RoverAPP.git
cd RoverAPP/deploy

sudo ./setup.sh relay.yourdomain.com "mongodb+srv://user:pass@cluster/db"
```

It installs Node 20 and Caddy, builds the relay, registers a systemd unit, and
writes the reverse-proxy config. It is idempotent — after a `git pull`,
re-running it is how you deploy an update.

### On a 0.5 GB instance, add swap first

`npm install` will otherwise be killed mid-build:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 8. Verify

```bash
curl https://relay.yourdomain.com/api/health     # {"status":"ok"}
sudo systemctl status roverapp                   # active (running)
sudo journalctl -u roverapp -f                   # live logs
```

Then the test that matters — the WebSocket path, not just HTTP:

```bash
npx wscat -c wss://relay.yourdomain.com/ws/esp32
> {"type":"register","macAddress":"AA:BB:CC:DD:EE:FF","role":"controller","roverMac":"8C:94:DF:72:0D:90"}
< {"type":"registered", ... "role":"controller" ...}
```

**If `role` comes back as `rover`, the instance built an old commit.** That
exact symptom is what silently broke the handheld before — the relay accepted
the connection and discarded everything it sent.

---

## 9. Repoint the clients

```bash
cd RoverAPP/deploy
./repoint.sh relay.yourdomain.com
```

Rewrites the host everywhere it appears — every sketch declaring `WS_HOST`,
plus `mobile/src/config.ts` and `web/src/lib/config.ts` — showing what it found
first. The sketches are located by searching rather than from a hardcoded list,
so a newly added rover is covered automatically.

Missing one leaves a board talking quietly to the old server, which looks
exactly like a board that is not working at all.

Then:

- **re-flash every board**
- **redeploy the web app** (the origin is baked into the bundle at build time)
- **rebuild the mobile app** if you ship it

---

## 10. Keeping it running

```bash
# deploy an update
cd RoverAPP && git pull && cd deploy && sudo ./setup.sh relay.yourdomain.com

# restart
sudo systemctl restart roverapp

# logs since boot
sudo journalctl -u roverapp -b

# certificate status
sudo journalctl -u caddy | grep -i certificate
```

Caddy renews automatically. There is no cron job to add and nothing to
remember.

---

## Costs

| Item | Monthly |
|---|---|
| `t4g.micro` on-demand | ~$6 |
| 8 GB gp3 | ~$0.70 |
| Elastic IP (attached) | free |
| Data transfer | pennies at this volume |
| **Total** | **~$7** |

A one-year Savings Plan takes the instance to roughly $4. On the free tier with
`t3.micro`, the first 12 months are free.

---

## What this fixes, and what it does not

**Fixes:** the free-tier throttling — those 534 ms spikes — and roughly 40 ms of
distance. Expect a hotspot round trip to go from 200–400 ms down to 60–150 ms.

**Does not fix:** the phone's radio, which is 30–100 ms each way and does not
care where the server is.

If you want the rover to feel like a remote control car, the remaining change is
**LAN direct mode** — UDP straight to the rover when both devices are on the
same network, with the relay as fallback. That is 2–10 ms, because the packet
never leaves the room. It is a separate change and worth doing after this one.
