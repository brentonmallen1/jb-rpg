import type { MadLibField, ThemeName } from '../types'

export interface MadlibPreset {
  name: string
  /** The theme it was written for; presets without one suit any story */
  theme?: ThemeName
  prompt: string
  fields: MadLibField[]
}

// Character creation presets. Every question asks sideways, so the table can't
// tell what an answer will become until the hero is revealed.
export const MADLIB_PRESETS: Record<string, MadlibPreset> = {
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
    theme: 'fantasy',
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
  },
  wandering_bard: {
    name: 'Wandering Bard',
    theme: 'fantasy',
    prompt: '{name} plays a battered {instrument} that once belonged to {previous_owner}. They only ever sing about {subject}, and they still owe {debt} to a very patient dragon.',
    fields: [
      { key: 'name', label: 'What would you name a tavern?', hint: 'a name' },
      { key: 'instrument', label: 'What household object makes the most satisfying noise?', hint: 'an object (an instrument)' },
      { key: 'previous_owner', label: 'Who was the most memorable teacher you ever had?', hint: 'a person' },
      { key: 'subject', label: 'What could you talk about for an hour without notes?', hint: 'a topic' },
      { key: 'debt', label: "What's the strangest thing you've ever borrowed?", hint: 'a thing' }
    ]
  },
  street_runner: {
    name: 'Street Runner',
    theme: 'cyberpunk',
    prompt: '{handle} jacks in from a coffin hotel above {district}. Their chrome is {augment}, paid for with {debt}. Tonight\'s job: steal {score}.',
    fields: [
      { key: 'handle', label: 'What would you name a pet robot?', hint: 'a name' },
      { key: 'district', label: "What's the loudest place you've ever been?", hint: 'a place' },
      { key: 'augment', label: 'If one of your hands could become any tool, what would it be?', hint: 'a gadget' },
      { key: 'debt', label: "What's something you'd never sell, no matter the price?", hint: 'something precious' },
      { key: 'score', label: "What's the most valuable thing you've ever held?", hint: 'an object' }
    ]
  },
  stranded_pilot: {
    name: 'Stranded Pilot',
    theme: 'deep_space',
    prompt: 'Captain {name} of the {ship} has drifted for {time}, haunted by {memory}. The only thing that keeps them going is {hope}.',
    fields: [
      { key: 'name', label: 'What would you name a newly discovered star?', hint: 'a name' },
      { key: 'ship', label: 'What was the name of the best pet you ever met?', hint: 'a name (for a ship)' },
      { key: 'time', label: 'How long is too long to wait in line?', hint: 'a length of time' },
      { key: 'memory', label: 'What smell takes you straight back to childhood?', hint: 'a memory' },
      { key: 'hope', label: 'What would you put in a time capsule?', hint: 'something hopeful' }
    ]
  },
  haunted_guest: {
    name: 'Haunted Guest',
    theme: 'horror',
    prompt: '{name} arrived at the house carrying only {possession}. Since the first night they keep hearing {sound}, and every mirror shows {reflection}. They came looking for {reason}.',
    fields: [
      { key: 'name', label: 'What name would you give an old doll?', hint: 'a name' },
      { key: 'possession', label: "What's in the back of your kitchen junk drawer?", hint: 'an object' },
      { key: 'sound', label: 'What noise does your house make at night?', hint: 'a sound' },
      { key: 'reflection', label: "What's the worst haircut you've ever seen?", hint: 'something odd' },
      { key: 'reason', label: 'What did you lose and never find?', hint: 'a lost thing' }
    ]
  },
  the_investigator: {
    name: 'The Investigator',
    theme: 'insanity',
    prompt: '{name}, a {occupation} with a weakness for {vice}, found {artifact} in a dead relative\'s attic. Since then, every dream ends with {vision}.',
    fields: [
      { key: 'name', label: 'What would a Victorian butler be called?', hint: 'a name' },
      { key: 'occupation', label: 'What job would you be worst at?', hint: 'a job' },
      { key: 'vice', label: "What snack can you never stop at just one of?", hint: 'an indulgence' },
      { key: 'artifact', label: "What's the oddest thing you've found at a yard sale?", hint: 'an object' },
      { key: 'vision', label: 'Describe the view from the tallest place you have stood.', hint: 'an image' }
    ]
  },
  night_shift: {
    name: 'Night Shift',
    theme: 'modern',
    prompt: '{name} works nights at {workplace}. Everyone knows them for {habit}, but nobody knows they can {secret_talent}. Tonight, {incident}.',
    fields: [
      { key: 'name', label: "What's the name of the last barista who got your order right?", hint: 'a name' },
      { key: 'workplace', label: 'Where would you hide from the rain?', hint: 'a place' },
      { key: 'habit', label: 'What do you do when you are bored in a meeting?', hint: 'a habit' },
      { key: 'secret_talent', label: 'What did you learn from a video that you never needed?', hint: 'a skill (verb phrase)' },
      { key: 'incident', label: "What's the strangest thing you've seen on public transport?", hint: 'an event' }
    ]
  },
  reluctant_chosen_one: {
    name: 'Reluctant Chosen One',
    prompt: '{name} was a perfectly happy {job} until a prophecy named them the one who would {destiny}. Honestly, they would rather be {preference}.',
    fields: [
      { key: 'name', label: 'What would you name a very serious goldfish?', hint: 'a name' },
      { key: 'job', label: 'What job do you think has the best snacks?', hint: 'a job' },
      { key: 'destiny', label: 'What chore do you put off the longest?', hint: 'an action (verb phrase)' },
      { key: 'preference', label: "What's your ideal lazy Sunday?", hint: 'an activity (-ing)' }
    ]
  },
  retired_villain: {
    name: 'Retired Villain',
    prompt: 'Once feared as {villain_name}, they now spend their days {hobby}. But old rivals still whisper about {deed}, and someone has just stolen {treasure}.',
    fields: [
      { key: 'villain_name', label: 'What would you call a thunderstorm if it had a name?', hint: 'a dramatic title' },
      { key: 'hobby', label: 'What would you do with a free afternoon and no phone?', hint: 'an activity (-ing)' },
      { key: 'deed', label: "What's the most chaotic thing you've done at a party?", hint: 'a deed' },
      { key: 'treasure', label: 'What would you grab first in a fire?', hint: 'a precious thing' }
    ]
  }
}
