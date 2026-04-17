import { Injectable } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { AgentTool, ToolsAgent } from '../../../src/decorators';
import { HumanInterrupt } from '../../../src/decorators/human-interrupt.decorator';

class SearchHotelsDto {
  @IsString()
  @MinLength(2)
  destination!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  guests?: number;
}

class ConfirmBookingDto {
  @IsString()
  hotelId!: string;

  @IsString()
  @MinLength(2)
  guestName!: string;

  @IsInt()
  @Min(10)
  @Max(100_000)
  totalPriceEur!: number;
}

@Injectable()
@ToolsAgent({
  name: 'BookingAgent',
  description: 'Finds hotels and books rooms. Asks a human to confirm before finalising.',
  systemPrompt:
    'You are a hotel booking SPECIALIST that returns FACTS to the supervisor. The user never sees ' +
    'your message directly — the supervisor synthesises the final reply.\n\n' +
    'Rules:\n' +
    '  - Call search_hotels to find options, then report them as a concise factual list ' +
    '(name, star rating, nightly price, total, hotel id).\n' +
    '  - NEVER ask the user questions. Never say "would you like to book?", ' +
    "\"let me know\", \"I'll pause\". You are not talking to the user.\n" +
    '  - Only call confirm_booking when the user has explicitly named a hotel AND ' +
    'provided a guest name. Otherwise just return the search results.\n' +
    '  - Do NOT answer weather or visa questions — another specialist handles those.',
})
export class BookingAgent {
  @AgentTool({
    name: 'confirm_booking',
    description:
      'Finalise a hotel booking. Pauses for human approval before charging — NEVER run this without ' +
      'the human explicitly saying yes first.',
    input: ConfirmBookingDto,
  })
  @HumanInterrupt({
    prompt: 'Review the booking details and approve or reject.',
    reason: 'booking.approval',
  })
  async confirmBooking(input: ConfirmBookingDto): Promise<string> {
    const ref = `BK-${Date.now().toString(36).toUpperCase()}`;
    return `Booking confirmed. Reference: ${ref}. Hotel: ${input.hotelId}. Guest: ${input.guestName}. Total charged: €${input.totalPriceEur}.`;
  }

  @AgentTool({
    name: 'search_hotels',
    description: 'Search available hotels at a destination for given dates.',
    input: SearchHotelsDto,
  })
  async searchHotels(input: SearchHotelsDto): Promise<string> {
    // Deterministic fake inventory for the demo.
    const hotels = [
      { id: 'hx-01', name: 'Le Grand Paradis', price: 189, rating: 4.5 },
      { id: 'hx-02', name: 'Hotel Moderne', price: 142, rating: 4.1 },
      { id: 'hx-03', name: 'Auberge du Soleil', price: 98, rating: 3.9 },
    ];
    const nights = Math.max(
      1,
      Math.round(
        (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    return hotels
      .map(
        (h) =>
          `- [${h.id}] ${h.name} (${h.rating}★) — €${h.price}/night — total: €${h.price * nights} for ${nights} night(s) in ${input.destination}`,
      )
      .join('\n');
  }
}
