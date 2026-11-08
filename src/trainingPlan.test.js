import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaces, formatPace, formatTime, generate4WeekPlan } from './trainingPlan.js';
import { BADGES_CONFIG, getUnlockedBadges } from './badges.js';

test('calculatePaces computes accurate aerobic and threshold training zones', () => {
  const basePaceSec = 480; // 8:00 / mi
  const zones = calculatePaces(basePaceSec);

  assert.equal(zones.easyPace, 535); // +55s
  assert.equal(zones.tempoPace, 495); // +15s
  assert.equal(zones.intervalPace, 455); // -25s

  assert.equal(zones.easyPaceFormatted, `8'55"/mi`);
  assert.equal(zones.tempoPaceFormatted, `8'15"/mi`);
  assert.equal(zones.intervalPaceFormatted, `7'35"/mi`);
});

test('formatPace and formatTime correctly format times and paces', () => {
  assert.equal(formatPace(512), `8'32"/mi`);
  assert.equal(formatPace(480), `8'00"/mi`);
  assert.equal(formatTime(3600), '1h 00m');
  assert.equal(formatTime(1525), '25m 25s');
  assert.equal(formatTime(4500), '1h 15m');
});

test('generate4WeekPlan produces a valid 4-week periodized block with weekly progression', () => {
  const basePaceSec = 510; // 8:30 / mi
  const plan5k = generate4WeekPlan('5k', basePaceSec);

  assert.equal(plan5k.goalId, '5k');
  assert.equal(plan5k.goalName, '5K Race Target');
  assert.equal(plan5k.weeks.length, 4);

  // Check week structure and progression
  plan5k.weeks.forEach((week, idx) => {
    assert.equal(week.weekNum, idx + 1);
    assert.ok(week.targetMiles > 0);
    assert.ok(week.days.length >= 4);
    week.days.forEach(day => {
      assert.ok(day.day);
      assert.ok(day.title);
      assert.ok(day.dist >= 0);
      assert.ok(day.pace);
    });
  });

  // Week 3 should be peak volume, Week 4 should taper before race
  assert.ok(plan5k.weeks[2].targetMiles > plan5k.weeks[0].targetMiles, 'Week 3 should have higher volume than Week 1');
  assert.ok(plan5k.weeks[3].targetMiles <= plan5k.weeks[2].targetMiles, 'Week 4 should taper before race day');
});

test('generate4WeekPlan supports all distance goals (10k, half, base)', () => {
  const goals = ['10k', 'half', 'base'];
  goals.forEach(goal => {
    const plan = generate4WeekPlan(goal, 500);
    assert.equal(plan.goalId, goal);
    assert.equal(plan.weeks.length, 4);
    assert.ok(plan.predictedTime);
  });
});

test('BADGES_CONFIG contains required athletic milestones', () => {
  assert.ok(BADGES_CONFIG.length >= 8);
  const badgeIds = BADGES_CONFIG.map(b => b.id);
  assert.ok(badgeIds.includes('early_bird'));
  assert.ok(badgeIds.includes('pace_5k'));
  assert.ok(badgeIds.includes('pace_10k'));
  assert.ok(badgeIds.includes('half_marathon'));
  assert.ok(badgeIds.includes('marathon_milestone'));
});

test('getUnlockedBadges provides initial unlocked milestones out of the box', () => {
  const unlocked = getUnlockedBadges();
  assert.ok(Array.isArray(unlocked));
  assert.ok(unlocked.includes('early_bird'));
  assert.ok(unlocked.includes('pace_5k'));
});
