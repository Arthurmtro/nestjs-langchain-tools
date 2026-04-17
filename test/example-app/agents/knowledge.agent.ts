import { Injectable, OnModuleInit } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { AgentTool, ToolsAgent } from '../../../src/decorators';
import { WithRetrieval } from '../../../src/decorators/with-retrieval.decorator';
import { VectorStoreService } from '../../../src/services/vector-store.service';

class SearchKnowledgeDto {
  @IsString()
  @MinLength(3)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number;
}

@Injectable()
@ToolsAgent({
  name: 'KnowledgeAgent',
  description:
    'Answers questions from the internal travel knowledge base (visa rules, destinations, tips).',
  systemPrompt:
    'You are a travel-knowledge SPECIALIST that returns FACTS to the supervisor. The user never ' +
    'sees your message directly — the supervisor synthesises the final reply.\n\n' +
    'Rules:\n' +
    '  - Call search_knowledge_base ONCE, then report a concise factual summary grounded in the ' +
    'returned snippets.\n' +
    '  - If the snippets do not contain the answer, reply that the knowledge base has no matching ' +
    'entry. Do NOT call the tool again with reworded queries.\n' +
    '  - NEVER ask the user questions. Never say "let me know" or similar.\n' +
    '  - Do NOT answer weather or hotel-booking questions; another specialist handles those.',
})
@WithRetrieval({
  enabled: true,
  collectionName: 'travel_kb',
  topK: 3,
  includeMetadata: true,
})
export class KnowledgeAgent implements OnModuleInit {
  constructor(private readonly vectorStore: VectorStoreService) {}

  async onModuleInit(): Promise<void> {
    // Seed a tiny corpus so the demo can answer questions without a real KB.
    await this.vectorStore.addDocuments(
      [
        'Schengen visa: EU and US citizens can visit Schengen area countries for up to 90 days without a visa for tourism.',
        'Japan visa for US citizens: US passport holders do not need a visa for tourism stays of up to 90 days. The passport must be valid for the length of the intended stay.',
        'Japan visa (general): most Western countries — US, UK, Canada, Australia, EU — benefit from visa-free short-stay tourism, typically 90 days.',
        'Kyoto tips: Use the city bus day-pass for most attractions; trains reach outlying areas like Arashiyama. Temples often close by 5pm — plan mornings for the big ones (Kinkaku-ji, Fushimi Inari).',
        'Kyoto neighborhoods: Gion and Higashiyama are the traditional heart, great for first-timers. Arashiyama is quieter and near the bamboo grove. Downtown Kyoto (around Kyoto Station / Shijo) is the most convenient for transit.',
        'Paris tips: Buy a Navigo Easy pass for public transport. Most museums are closed on Mondays or Tuesdays — check before visiting.',
        'Tokyo tips: Get a Suica or Pasmo card for trains and vending machines. Tipping is generally not expected and can be impolite.',
        'Rome tips: Many restaurants charge a coperto (cover charge) separately. The Colosseum requires timed-entry tickets booked in advance.',
        'Barcelona: The city is well served by the metro. Beware of pickpockets around Las Ramblas and major tourist sites.',
        'Currency: Japan is largely still cash-based for small shops. Europe is almost universally contactless card-friendly.',
      ],
      'travel_kb',
    );
  }

  @AgentTool({
    name: 'search_knowledge_base',
    description: 'Semantic search over the internal travel knowledge base.',
    input: SearchKnowledgeDto,
  })
  async search(input: SearchKnowledgeDto): Promise<string> {
    const results = await this.vectorStore.similaritySearch(input.query, 'travel_kb', {
      limit: input.topK ?? 3,
    });
    if (results.length === 0) return 'No relevant information found.';
    return results
      .map(
        (r, i) =>
          `[${i + 1}] (score ${(r.score * 100).toFixed(0)}%) ${r.document.pageContent}`,
      )
      .join('\n');
  }
}
