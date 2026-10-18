import { ScoreSystem } from "../../src/systems/ScoreSystem";
import { ProgressionSystem, type RunReward } from "../../src/systems/ProgressionSystem";
import type { RunResult } from "../../src/game/GameState";
import type { WechatSave } from "./save";

export type WechatResult = RunResult & RunReward;
/** Collision and delayed UI callbacks may ask twice; settlement is once per run. */
export class WechatSession {
  readonly score: ScoreSystem;
  private result: WechatResult | null = null;
  constructor(private readonly save: WechatSave) { this.score = new ScoreSystem(save); }
  finish(): WechatResult {
    if (!this.result) {
      const score = this.score.finish();
      const reward = new ProgressionSystem().awardRun(score.score, this.save);
      this.result = { ...score, ...reward };
    }
    return { ...this.result };
  }
}
