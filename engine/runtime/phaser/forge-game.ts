/**
 * Phaser runtime — turns a validated GameDefinition into a real playable top-down action/survivor
 * game using Phaser 3 (arcade physics, real collisions, tweens). This is the SDK doing the heavy
 * lifting; the AI only supplies the GameDefinition. Client-only (import dynamically in the browser).
 *
 * Covers: WASD/arrow movement, auto-fire weapons, enemy AI by role (chaser/shooter/charger/brute),
 * timed waves, XP pickups + level-up upgrades, a boss with attack patterns, HUD, win/lose, restart.
 */
import * as Phaser from 'phaser';
import type { GameDefinition, Enemy } from '../game-definition';

const hex = (c: string): number => Phaser.Display.Color.HexStringToColor(c).color;

interface ForgeHandle { destroy(): void; }

class ForgeScene extends Phaser.Scene {
  private def!: GameDefinition;
  private player!: Phaser.Physics.Arcade.Image;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private orbs!: Phaser.Physics.Arcade.Group;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hpText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private banner?: Phaser.GameObjects.Text;

  private hp = 100;
  private maxHp = 100;
  private score = 0;
  private xp = 0;
  private level = 1;
  private xpToNext = 8;
  private elapsed = 0;
  private fireTimer = 0;
  private dmg = 10;
  private cooldownMs = 360;
  private projectiles = 1;
  private moveSpeed = 200;
  private spawnQueue: { at: number; enemy: Enemy }[] = [];
  private bossSpawned = false;
  private boss: Phaser.Physics.Arcade.Image | undefined;
  private bossPatternTimer = 0;
  private over = false;

  constructor() { super('forge'); }
  init(data: { def: GameDefinition }) { this.def = data.def; }

  preload() {
    const p = this.def.palette;
    this.circleTex('player', p.player, this.def.player.radius);
    this.circleTex('bullet', p.projectile, 4);
    this.circleTex('ebullet', p.danger, 5);
    this.circleTex('orb', p.xp, 5);
    this.def.enemies.forEach((e, i) => this.circleTex(`enemy-${i}`, [p.danger, p.accent, p.xp][i % 3] ?? p.danger, e.radius));
    if (this.def.boss) this.circleTex('boss', p.danger, this.def.boss.radius);
  }

  private circleTex(key: string, color: string, r: number) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(hex(color), 1);
    g.fillCircle(r, r, r);
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeCircle(r, r, r);
    g.generateTexture(key, r * 2, r * 2);
    g.destroy();
  }

  create() {
    const { width, height } = this.scale;
    this.maxHp = this.def.player.maxHealth; this.hp = this.maxHp;
    const w0 = this.def.player.weapons[0]!;
    this.dmg = w0.damage; this.cooldownMs = w0.cooldownMs; this.projectiles = w0.projectiles;
    this.moveSpeed = this.def.player.speed;
    this.score = 0; this.xp = 0; this.level = 1; this.xpToNext = 8; this.elapsed = 0; this.over = false;
    this.bossSpawned = false; this.boss = undefined;

    this.cameras.main.setBackgroundColor(this.def.palette.background);
    this.drawGrid(width, height);

    this.player = this.physics.add.image(width / 2, height / 2, 'player').setCircle(this.def.player.radius);
    this.player.setCollideWorldBounds(true).setDepth(5);

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.orbs = this.physics.add.group();

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,R') as Record<string, Phaser.Input.Keyboard.Key>;

    // build the spawn schedule from waves
    this.spawnQueue = [];
    for (const wave of this.def.waves) {
      const enemy = this.def.enemies.find((e) => e.id === wave.enemyId) ?? this.def.enemies[0]!;
      for (let i = 0; i < wave.count; i++) this.spawnQueue.push({ at: wave.atSeconds + (i * wave.everyMs) / 1000, enemy });
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.hitEnemy(b as Phaser.Physics.Arcade.Image, e as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.touchPlayer(e as Phaser.Physics.Arcade.Image, (e as Phaser.GameObjects.GameObject).getData('damage') ?? 8));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => { (b as Phaser.Physics.Arcade.Image).destroy(); this.damagePlayer(8); });
    this.physics.add.overlap(this.player, this.orbs, (_p, o) => this.collectOrb(o as Phaser.Physics.Arcade.Image));

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.hpText = this.add.text(16, 26, '', { fontFamily: 'system-ui', fontSize: '13px', color: '#fff' }).setScrollFactor(0).setDepth(20);
    this.infoText = this.add.text(width - 16, 16, '', { fontFamily: 'system-ui', fontSize: '13px', color: '#fff' }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
  }

  private drawGrid(w: number, h: number) {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(hex(this.def.palette.floor), 1).fillRect(0, 0, w, h);
    g.lineStyle(1, 0xffffff, 0.04);
    for (let x = 0; x < w; x += 48) g.lineBetween(x, 0, x, h);
    for (let y = 0; y < h; y += 48) g.lineBetween(0, y, w, y);
  }

  private spawnEnemy(e: Enemy, isBoss = false) {
    const { width, height } = this.scale;
    const edge = Phaser.Math.Between(0, 3);
    const x = edge === 0 ? 0 : edge === 1 ? width : Phaser.Math.Between(0, width);
    const y = edge === 2 ? 0 : edge === 3 ? height : Phaser.Math.Between(0, height);
    const key = isBoss ? 'boss' : `enemy-${this.def.enemies.indexOf(e)}`;
    const img = this.physics.add.image(x, y, key).setCircle(e.radius).setDepth(4);
    img.setData('hp', e.health); img.setData('role', e.role); img.setData('speed', e.speed);
    img.setData('damage', e.damage); img.setData('xp', e.xp); img.setData('score', e.score);
    img.setData('fire', 0); img.setData('boss', isBoss);
    this.enemies.add(img);
    if (isBoss) this.boss = img;
  }

  private fire() {
    let nearest: Phaser.Physics.Arcade.Image | null = null; let best = Infinity;
    this.enemies.children.iterate((c) => {
      const e = c as Phaser.Physics.Arcade.Image;
      const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
      if (d < best) { best = d; nearest = e; }
      return true;
    });
    if (!nearest) return;
    const target = nearest as Phaser.Physics.Arcade.Image;
    const base = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const w0 = this.def.player.weapons[0]!;
    for (let i = 0; i < this.projectiles; i++) {
      const a = base + (i - (this.projectiles - 1) / 2) * 0.18;
      const b = this.physics.add.image(this.player.x, this.player.y, 'bullet').setDepth(3);
      this.bullets.add(b);
      (b.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * w0.projectileSpeed, Math.sin(a) * w0.projectileSpeed);
      this.time.delayedCall(1500, () => b.destroy());
    }
  }

  private hitEnemy(b: Phaser.Physics.Arcade.Image, e: Phaser.Physics.Arcade.Image) {
    if (!b.active || !e.active) return;
    b.destroy();
    const hp = (e.getData('hp') as number) - this.dmg;
    if (hp <= 0) {
      const orb = this.physics.add.image(e.x, e.y, 'orb').setDepth(2);
      orb.setData('xp', e.getData('xp')); this.orbs.add(orb);
      this.score += e.getData('score') as number;
      const wasBoss = e.getData('boss') as boolean;
      e.destroy();
      if (wasBoss) this.win();
    } else {
      e.setData('hp', hp);
      this.tweens.add({ targets: e, alpha: 0.4, duration: 60, yoyo: true });
    }
  }

  private touchPlayer(_e: Phaser.Physics.Arcade.Image, dmg: number) { this.damagePlayer(dmg * 0.02); }

  private damagePlayer(amount: number) {
    if (this.over) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.lose(); }
  }

  private collectOrb(o: Phaser.Physics.Arcade.Image) {
    this.xp += (o.getData('xp') as number) || 1; o.destroy();
    if (this.xp >= this.xpToNext) { this.xp -= this.xpToNext; this.level++; this.xpToNext = Math.round(this.xpToNext * 1.4); this.applyUpgrade(); }
  }

  private applyUpgrade() {
    const ups = this.def.upgrades;
    const up = ups[Phaser.Math.Between(0, Math.max(0, ups.length - 1))];
    this.hp = Math.min(this.maxHp, this.hp + 15);
    if (!up) return;
    if (up.kind === 'damage') this.dmg += up.amount;
    else if (up.kind === 'cooldown') this.cooldownMs = Math.max(120, this.cooldownMs - up.amount);
    else if (up.kind === 'speed') this.moveSpeed += up.amount;
    else if (up.kind === 'projectiles') this.projectiles += up.amount;
    else if (up.kind === 'maxHealth') { this.maxHp += up.amount; this.hp += up.amount; }
    this.flash(`Level ${this.level} — ${up.name}`);
  }

  private flash(msg: string) {
    const t = this.add.text(this.scale.width / 2, 80, msg, { fontFamily: 'system-ui', fontSize: '16px', color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(25);
    this.tweens.add({ targets: t, y: 60, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  private bossAttack() {
    if (!this.boss || !this.boss.active) return;
    const cx = this.boss.x; const cy = this.boss.y;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + this.elapsed;
      const b = this.physics.add.image(cx, cy, 'ebullet').setDepth(3);
      this.enemyBullets.add(b);
      (b.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * 180, Math.sin(a) * 180);
      this.time.delayedCall(4000, () => b.destroy());
    }
  }

  update(_t: number, deltaMs: number) {
    if (this.over) { if (this.keys['R']?.isDown) this.scene.restart({ def: this.def }); return; }
    const dt = deltaMs / 1000;
    this.elapsed += dt;

    // movement
    const left = this.keys['A']?.isDown || this.keys['LEFT']?.isDown;
    const right = this.keys['D']?.isDown || this.keys['RIGHT']?.isDown;
    const up = this.keys['W']?.isDown || this.keys['UP']?.isDown;
    const down = this.keys['S']?.isDown || this.keys['DOWN']?.isDown;
    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(vx, vy) || 1;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity((vx / len) * this.moveSpeed, (vy / len) * this.moveSpeed);

    // waves
    while (this.spawnQueue.length && this.spawnQueue[0]!.at <= this.elapsed) {
      this.spawnEnemy(this.spawnQueue.shift()!.enemy);
    }
    // boss
    if (this.def.boss && !this.bossSpawned && this.elapsed >= this.def.boss.spawnAtSeconds) {
      this.bossSpawned = true; this.spawnEnemy(this.def.boss, true); this.flash(`${this.def.boss.name} appears!`);
    }
    if (this.boss && this.boss.active) {
      this.bossPatternTimer += dt;
      if (this.bossPatternTimer > 1.8) { this.bossPatternTimer = 0; this.bossAttack(); }
    }

    // auto-fire
    this.fireTimer += deltaMs;
    if (this.fireTimer >= this.cooldownMs) { this.fireTimer = 0; this.fire(); }

    // enemy AI
    this.enemies.children.iterate((c) => {
      const e = c as Phaser.Physics.Arcade.Image;
      if (!e.active) return true;
      const role = e.getData('role') as string;
      const speed = e.getData('speed') as number;
      const ang = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
      const body = e.body as Phaser.Physics.Arcade.Body;
      const dist = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
      if (role === 'shooter') {
        if (dist > 260) body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
        else body.setVelocity(Math.cos(ang + 1.5) * speed, Math.sin(ang + 1.5) * speed);
        const f = (e.getData('fire') as number) + dt;
        if (f > 1.6) { e.setData('fire', 0); const b = this.physics.add.image(e.x, e.y, 'ebullet').setDepth(3); this.enemyBullets.add(b); (b.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(ang) * 220, Math.sin(ang) * 220); this.time.delayedCall(4000, () => b.destroy()); }
        else e.setData('fire', f);
      } else if (role === 'charger') {
        const f = (e.getData('fire') as number) + dt;
        if (f > 2.4) { e.setData('fire', 0); body.setVelocity(Math.cos(ang) * speed * 3, Math.sin(ang) * speed * 3); }
        else { e.setData('fire', f); body.velocity.scale(0.96); if (body.velocity.length() < speed) body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed); }
      } else {
        body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
      }
      return true;
    });

    // HUD
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.3).fillRect(16, 12, 180, 8);
    this.hpBar.fillStyle(hex(this.def.palette.danger), 1).fillRect(16, 12, 180 * Math.max(0, this.hp / this.maxHp), 8);
    this.hpText.setText(`${Math.ceil(this.hp)} HP   ·   Lv ${this.level}`);
    const remain = this.def.boss ? '' : `   ${Math.max(0, Math.ceil(this.def.arena.durationSeconds - this.elapsed))}s`;
    this.infoText.setText(`Score ${this.score}${remain}`);

    if (this.def.winCondition === 'survive' && this.elapsed >= this.def.arena.durationSeconds) this.win();
  }

  private end(text: string, color: string) {
    this.over = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.55).setScrollFactor(0).setDepth(30);
    this.banner = this.add.text(this.scale.width / 2, this.scale.height / 2, `${text}\nScore ${this.score} · press R to restart`, { fontFamily: 'system-ui', fontSize: '26px', color, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(31);
  }
  private win() { if (!this.over) this.end('You win', '#c4e070'); }
  private lose() { if (!this.over) this.end('You fell', '#ff6f6f'); }
}

export function createForgeGame(parent: HTMLElement, definition: GameDefinition): ForgeHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: definition.arena.width,
    height: definition.arena.height,
    backgroundColor: definition.palette.background,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: ForgeScene,
  });
  game.scene.start('forge', { def: definition });
  return { destroy: () => game.destroy(true) };
}
