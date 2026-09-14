import { Inject, Injectable } from "@nestjs/common";
import { SimulatorAdapter, type ChannelAdapter } from "@ar/core";
import type { Channel, OutboundMessage } from "@ar/shared";
import { WhatsAppAdapter } from "../whatsapp/whatsapp.adapter.js";

/** Registry of channel adapters. Adding a channel = one adapter + one line here. */
@Injectable()
export class ChannelRegistry {
  readonly simulator: SimulatorAdapter;
  constructor(@Inject(WhatsAppAdapter) private readonly whatsapp: WhatsAppAdapter) {
    this.simulator = new SimulatorAdapter((m: OutboundMessage) => m.text);
  }
  get(channel: Channel): ChannelAdapter {
    return channel === "WHATSAPP" ? this.whatsapp : this.simulator;
  }
}
