import type { MadLibField } from '../types'

// Built-in character creation presets with indirect, creative questions
export const MADLIB_PRESETS: Record<string, { name: string; prompt: string; fields: MadLibField[] }> = {
  classic_hero: {
    name: 'Classic Hero',
    prompt: '{name} the {profession} has a secret weakness: {weakness}. They journey forth to {quest}.',
    fields: [
      { key: 'name', label: 'If you could name a constellation, what would you call it?', hint: 'a name' },
      { key: 'profession', label: "What job would you do if money didn't matter?", hint: 'a job or role' },
      { key: 'weakness', label: 'What keeps you up at 3am?', hint: 'a fear or worry' },
      { key: 'quest', label: 'If you had one wish, what would it be?', hint: 'a goal' }
    ]
  },
  mysterious_stranger: {
    name: 'Mysterious Stranger',
    prompt: 'They go by {alias}, but no one knows their true name. They carry the weight of {secret} and fear nothing except {fear}. Now they seek {goal}.',
    fields: [
      { key: 'alias', label: 'What would your spy codename be?', hint: 'a name or title' },
      { key: 'secret', label: "What's something you've never told anyone?", hint: 'a secret' },
      { key: 'fear', label: 'What sound makes you uncomfortable?', hint: 'something unsettling' },
      { key: 'goal', label: 'What would you search for in an abandoned library?', hint: 'something valuable' }
    ]
  },
  unlikely_champion: {
    name: 'Unlikely Champion',
    prompt: '{name} was just a simple {job} until they discovered they could {talent}. Now, driven by {motivation}, they must become something more.',
    fields: [
      { key: 'name', label: 'What name would you give to a friendly ghost?', hint: 'a name' },
      { key: 'job', label: "What's the most boring job you can think of?", hint: 'a mundane job' },
      { key: 'talent', label: 'What would be an absurd superpower?', hint: 'an unusual ability' },
      { key: 'motivation', label: 'What makes you get out of bed in the morning?', hint: 'a driving force' }
    ]
  },
  fallen_noble: {
    name: 'Fallen Noble',
    prompt: 'Once known as {title}, they ruled over {domain}. But {downfall} stripped everything away. Now they wander, seeking {redemption}.',
    fields: [
      { key: 'title', label: 'What would your royal title be?', hint: 'a title or honorific' },
      { key: 'domain', label: 'What place feels like home to you?', hint: 'a place' },
      { key: 'downfall', label: "What's the worst way to lose a game?", hint: 'a way to fail' },
      { key: 'redemption', label: 'What would you do with a second chance?', hint: 'an action or goal' }
    ]
  },
  scrappy_survivor: {
    name: 'Scrappy Survivor',
    prompt: 'On the streets they call them {nickname}. They grew up in {origin} and learned to survive by {skill}. But deep down, they dream of {dream}.',
    fields: [
      { key: 'nickname', label: 'What nickname did you have as a kid?', hint: 'a nickname' },
      { key: 'origin', label: 'Describe a place that smells like memories.', hint: 'a place description' },
      { key: 'skill', label: "What's something you're surprisingly good at?", hint: 'a skill' },
      { key: 'dream', label: 'What would you do if you won the lottery?', hint: 'a dream or wish' }
    ]
  }
}
