// @ts-check

/*
 * Trivia's question bank — the editable content, kept apart from the game logic
 * in trivia.js so the deck can grow without wading through rendering code. This
 * file is pure data: it exports the categories and the full deck, and holds no
 * behaviour.
 *
 * It's a sibling module of trivia.js (same folder), so the game stays fully
 * self-contained — it imports only from within its own folder, never another
 * game or the hub. The service worker precaches it as <id>.data.js alongside
 * <id>.js (see sw.js), so splitting the bank out keeps the game playable
 * offline after a single visit to the hub.
 *
 * Flags are real SVG files in ./flags/ (each in its country's official aspect
 * ratio — see flags/CREDITS.md), referenced by the `code` stem and rendered by
 * trivia.js with an <img> so they stay crisp at any size. They load on demand;
 * the service worker caches each one as it's viewed.
 */

/** @typedef {'basic' | 'easy' | 'med' | 'hard' | 'expert' | 'impossible'} Difficulty */

/**
 * One question. Answers are open-ended (said out loud), so `a` is a short
 * canonical answer the host checks against, not a multiple choice. `fmt='flag'`
 * marks a visual question whose prompt is the flag image named by `code`.
 *
 * @typedef {Object} Question
 * @property {string} q              The text prompt ('' for visual questions).
 * @property {string} a              A short answer for the host to confirm against.
 * @property {string} cat            Category id (see CATEGORIES).
 * @property {Difficulty} d          Difficulty tier.
 * @property {'flag'} [fmt]          Optional special rendering (visual question).
 * @property {string} [code]         Flag file stem for a visual prompt (flags/<code>.svg).
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 */

/** @type {Category[]} */
export const CATEGORIES = [
  { id: 'geo', name: 'Geography', emoji: '🌍' },
  { id: 'hist', name: 'History', emoji: '🏛️' },
  { id: 'sci', name: 'Science', emoji: '🔬' },
  { id: 'nature', name: 'Animals & Nature', emoji: '🐾' },
  { id: 'sport', name: 'Sport', emoji: '⚽' },
  { id: 'music', name: 'Music', emoji: '🎵' },
  { id: 'film', name: 'Movies & TV', emoji: '🎬' },
  { id: 'arts', name: 'Art & Books', emoji: '🎨' },
  { id: 'food', name: 'Food & Drink', emoji: '🍴' },
  { id: 'words', name: 'Words & Language', emoji: '🔤' },
  { id: 'math', name: 'Maths & Numbers', emoji: '🔢' },
  { id: 'general', name: 'General Knowledge', emoji: '🧠' },
  { id: 'flags', name: 'Flags', emoji: '🚩' },
];

/**
 * The flags pool — country plus the SVG stem in ./flags/. Difficulty is by how
 * widely recognised the flag is. This set is almost all well-known countries,
 * so it tops out at `expert` (the least familiar here — still real places a
 * keen player can name) and has nothing `impossible`: the genuinely obscure
 * flags (Pacific microstates and other rarely-seen nations) just aren't in
 * flags/ yet. Add a row — and drop its <code>.svg in flags/ — to extend it,
 * including to fill out the harder tiers.
 *
 * @type {{ code: string, name: string, d: Difficulty }[]}
 */
const FLAGS = [
  // basic — known the world over
  { code: 'us', name: 'United States', d: 'basic' },
  { code: 'gb', name: 'United Kingdom', d: 'basic' },
  { code: 'fr', name: 'France', d: 'basic' },
  { code: 'de', name: 'Germany', d: 'basic' },
  { code: 'it', name: 'Italy', d: 'basic' },
  { code: 'jp', name: 'Japan', d: 'basic' },
  { code: 'ca', name: 'Canada', d: 'basic' },
  { code: 'br', name: 'Brazil', d: 'basic' },
  { code: 'cn', name: 'China', d: 'basic' },

  // easy — most adults place these; distinctive emblems or famous countries
  { code: 'es', name: 'Spain', d: 'easy' },
  { code: 'ru', name: 'Russia', d: 'easy' },
  { code: 'in', name: 'India', d: 'easy' },
  { code: 'mx', name: 'Mexico', d: 'easy' },
  { code: 'au', name: 'Australia', d: 'easy' },
  { code: 'nl', name: 'Netherlands', d: 'easy' },
  { code: 'ch', name: 'Switzerland', d: 'easy' },
  { code: 'se', name: 'Sweden', d: 'easy' },
  { code: 'no', name: 'Norway', d: 'easy' },
  { code: 'dk', name: 'Denmark', d: 'easy' },
  { code: 'fi', name: 'Finland', d: 'easy' },
  { code: 'ie', name: 'Ireland', d: 'easy' },
  { code: 'gr', name: 'Greece', d: 'easy' },
  { code: 'pt', name: 'Portugal', d: 'easy' },
  { code: 'tr', name: 'Turkey', d: 'easy' },
  { code: 'kr', name: 'South Korea', d: 'easy' },
  { code: 'za', name: 'South Africa', d: 'easy' },
  { code: 'il', name: 'Israel', d: 'easy' },
  { code: 'eg', name: 'Egypt', d: 'easy' },
  { code: 'ar', name: 'Argentina', d: 'easy' },

  // medium — recognisable, but takes a moment to place
  { code: 'be', name: 'Belgium', d: 'med' },
  { code: 'at', name: 'Austria', d: 'med' },
  { code: 'pl', name: 'Poland', d: 'med' },
  { code: 'ua', name: 'Ukraine', d: 'med' },
  { code: 'cz', name: 'Czechia', d: 'med' },
  { code: 'hu', name: 'Hungary', d: 'med' },
  { code: 'ro', name: 'Romania', d: 'med' },
  { code: 'is', name: 'Iceland', d: 'med' },
  { code: 'hr', name: 'Croatia', d: 'med' },
  { code: 'rs', name: 'Serbia', d: 'med' },
  { code: 'sk', name: 'Slovakia', d: 'med' },
  { code: 'si', name: 'Slovenia', d: 'med' },
  { code: 'lt', name: 'Lithuania', d: 'med' },
  { code: 'lv', name: 'Latvia', d: 'med' },
  { code: 'ee', name: 'Estonia', d: 'med' },
  { code: 'by', name: 'Belarus', d: 'med' },
  { code: 'bg', name: 'Bulgaria', d: 'med' },
  { code: 'sa', name: 'Saudi Arabia', d: 'med' },
  { code: 'th', name: 'Thailand', d: 'med' },
  { code: 'vn', name: 'Vietnam', d: 'med' },
  { code: 'id', name: 'Indonesia', d: 'med' },
  { code: 'ph', name: 'Philippines', d: 'med' },
  { code: 'ng', name: 'Nigeria', d: 'med' },
  { code: 'ke', name: 'Kenya', d: 'med' },
  { code: 'ma', name: 'Morocco', d: 'med' },

  // hard — you need to know your flags
  { code: 'np', name: 'Nepal', d: 'hard' },
  { code: 'gh', name: 'Ghana', d: 'hard' },
  { code: 'et', name: 'Ethiopia', d: 'hard' },
  { code: 'qa', name: 'Qatar', d: 'hard' },
  { code: 'ae', name: 'United Arab Emirates', d: 'hard' },
  { code: 'pk', name: 'Pakistan', d: 'hard' },
  { code: 'tn', name: 'Tunisia', d: 'hard' },
  { code: 'cl', name: 'Chile', d: 'hard' },
  { code: 'pe', name: 'Peru', d: 'hard' },
  { code: 'co', name: 'Colombia', d: 'hard' },
  { code: 'uy', name: 'Uruguay', d: 'hard' },
  { code: 'cu', name: 'Cuba', d: 'hard' },
  { code: 'my', name: 'Malaysia', d: 'hard' },
  { code: 'sg', name: 'Singapore', d: 'hard' },
  { code: 'nz', name: 'New Zealand', d: 'hard' },
  { code: 'jm', name: 'Jamaica', d: 'hard' },

  // expert — the least familiar here, but still gettable
  { code: 'bd', name: 'Bangladesh', d: 'expert' },
  { code: 'lk', name: 'Sri Lanka', d: 'expert' },
  { code: 'kz', name: 'Kazakhstan', d: 'expert' },
  { code: 'ec', name: 'Ecuador', d: 'expert' },
  { code: 've', name: 'Venezuela', d: 'expert' },
  { code: 'pa', name: 'Panama', d: 'expert' },
];

/** @type {Question[]} */
const FLAG_QUESTIONS = FLAGS.map((f) => ({
  q: '',
  a: f.name,
  cat: 'flags',
  d: f.d,
  fmt: /** @type {'flag'} */ ('flag'),
  code: f.code,
}));

/**
 * The text bank — a curated, fact-checked mix kept to stable, well-known answers
 * (capitals, classic science, household names) so it never goes out of date.
 * Every question is graded on the six-tier scale, from `basic` (everyone should
 * know it) to `impossible` (almost no one will), with the bulk in the easy–hard
 * middle. Grow it freely: add a `{ q, a, cat, d }` row.
 *
 * @type {Question[]}
 */
const TEXT_QUESTIONS = [
  // --- Geography ----------------------------------------------------------
  { q: 'What is the capital of France?', a: 'Paris', cat: 'geo', d: 'basic' },
  { q: 'What is the capital of Italy?', a: 'Rome', cat: 'geo', d: 'basic' },
  { q: 'Which country is shaped like a boot?', a: 'Italy', cat: 'geo', d: 'basic' },
  { q: 'What is the capital of England?', a: 'London', cat: 'geo', d: 'basic' },
  { q: 'Which is the largest ocean on Earth?', a: 'The Pacific Ocean', cat: 'geo', d: 'easy' },
  { q: 'Which continent is Egypt mostly located in?', a: 'Africa', cat: 'geo', d: 'easy' },
  { q: 'What is the capital of Spain?', a: 'Madrid', cat: 'geo', d: 'easy' },
  { q: 'Which is the largest country in the world by area?', a: 'Russia', cat: 'geo', d: 'easy' },
  { q: 'Which is the largest hot desert in the world?', a: 'The Sahara', cat: 'geo', d: 'easy' },
  { q: 'Mount Kilimanjaro is in which country?', a: 'Tanzania', cat: 'geo', d: 'med' },
  { q: 'What is the smallest country in the world by area?', a: 'Vatican City', cat: 'geo', d: 'med' },
  { q: 'What is the capital of Canada?', a: 'Ottawa', cat: 'geo', d: 'med' },
  { q: 'What is the capital of Australia?', a: 'Canberra', cat: 'geo', d: 'hard' },
  { q: 'What is the capital of New Zealand?', a: 'Wellington', cat: 'geo', d: 'hard' },
  { q: 'Lake Titicaca lies between which two countries?', a: 'Peru and Bolivia', cat: 'geo', d: 'hard' },
  { q: 'Which African country was formerly known as Abyssinia?', a: 'Ethiopia', cat: 'geo', d: 'expert' },
  { q: 'What is the capital of Mongolia?', a: 'Ulaanbaatar', cat: 'geo', d: 'expert' },
  { q: 'What is the capital of Kazakhstan?', a: 'Astana', cat: 'geo', d: 'expert' },
  { q: 'What is the largest desert in the world?', a: 'The Antarctic Desert', cat: 'geo', d: 'expert' },
  { q: 'What is the capital of Bhutan?', a: 'Thimphu', cat: 'geo', d: 'impossible' },

  // --- History ------------------------------------------------------------
  { q: 'Who was the first President of the United States?', a: 'George Washington', cat: 'hist', d: 'basic' },
  { q: 'In which country are the ancient pyramids of Giza?', a: 'Egypt', cat: 'hist', d: 'basic' },
  { q: 'Which country did the USA gain independence from?', a: 'Great Britain', cat: 'hist', d: 'basic' },
  { q: 'What year did World War II end?', a: '1945', cat: 'hist', d: 'easy' },
  { q: 'Who was the first person to walk on the Moon?', a: 'Neil Armstrong', cat: 'hist', d: 'easy' },
  { q: 'Who was the British Prime Minister during most of World War II?', a: 'Winston Churchill', cat: 'hist', d: 'med' },
  { q: 'Hannibal famously crossed the Alps using what animal?', a: 'Elephants', cat: 'hist', d: 'med' },
  { q: 'What year did the Titanic sink?', a: '1912', cat: 'hist', d: 'hard' },
  { q: 'Which civilization built the city of Machu Picchu?', a: 'The Inca', cat: 'hist', d: 'hard' },
  { q: 'What year did the Berlin Wall fall?', a: '1989', cat: 'hist', d: 'hard' },
  { q: 'What year did the French Revolution begin?', a: '1789', cat: 'hist', d: 'hard' },
  { q: 'What year did the USA declare independence?', a: '1776', cat: 'hist', d: 'hard' },
  { q: 'Which ancient city was destroyed by the eruption of Mount Vesuvius in 79 AD?', a: 'Pompeii', cat: 'hist', d: 'hard' },
  { q: 'Which English queen reigned when the Spanish Armada was defeated in 1588?', a: 'Elizabeth I', cat: 'hist', d: 'expert' },
  { q: 'Who was the first Emperor of Rome?', a: 'Augustus (Octavian)', cat: 'hist', d: 'expert' },
  { q: 'What royal charter, signed in 1215, limited the powers of the English king?', a: 'Magna Carta ("Great Charter")', cat: 'hist', d: 'expert' },
  { q: 'What century did the Hundred Years’ War end?', a: '15th century', cat: 'hist', d: 'expert' },
  { q: 'Which 1648 peace settlement ended the Thirty Years’ War?', a: 'The Peace of Westphalia', cat: 'hist', d: 'impossible' },

  // --- Science ------------------------------------------------------------
  { q: 'What is the chemical formula for water?', a: 'H₂O', cat: 'sci', d: 'basic' },
  { q: 'What force pulls objects towards the centre of the Earth?', a: 'Gravity', cat: 'sci', d: 'basic' },
  { q: 'What process do plants use to convert sunlight, carbon dioxide, and water into food?', a: 'Photosynthesis', cat: 'sci', d: 'easy' },
  { q: 'How many planets are in our solar system?', a: 'Eight', cat: 'sci', d: 'easy' },
  { q: 'What is the hardest known natural material?', a: 'Diamond', cat: 'sci', d: 'easy' },
  { q: 'What is the chemical symbol for gold?', a: 'Au', cat: 'sci', d: 'med' },
  { q: 'Which part of a cell contains its DNA?', a: 'The nucleus', cat: 'sci', d: 'med' },
  { q: 'Who proposed the theory of general relativity?', a: 'Albert Einstein', cat: 'sci', d: 'med' },
  { q: 'What gas makes up ~78% of Earth’s atmosphere?', a: 'Nitrogen (N₂)', cat: 'sci', d: 'med' },
  { q: 'Which subatomic particle carries a negative electric charge?', a: 'The electron', cat: 'sci', d: 'med' },
  { q: 'What is the chemical symbol for sodium?', a: 'Na', cat: 'sci', d: 'hard' },
  { q: 'What is the most abundant element in the universe?', a: 'Hydrogen (H)', cat: 'sci', d: 'hard' },
  { q: 'Roughly how fast does light travel?', a: 'About 300,000 km/s', cat: 'sci', d: 'expert' },
  { q: 'What is the SI unit of electrical resistance?', a: 'The ohm', cat: 'sci', d: 'expert' },
  { q: 'What is the rarest naturally occurring element on Earth?', a: 'Astatine', cat: 'sci', d: 'impossible' },

  // --- Animals & Nature ---------------------------------------------------
  { q: 'What is the largest land animal?', a: 'The African elephant', cat: 'nature', d: 'basic' },
  { q: 'How many legs does a spider have?', a: 'Eight', cat: 'nature', d: 'basic' },
  { q: 'What do caterpillars turn into?', a: 'Butterflies (or moths)', cat: 'nature', d: 'basic' },
  { q: 'What is the fastest land animal?', a: 'The cheetah', cat: 'nature', d: 'easy' },
  { q: 'What is the largest animal ever known to have lived?', a: 'The blue whale', cat: 'nature', d: 'easy' },
  { q: 'What do you call an animal that eats only plants?', a: 'A herbivore', cat: 'nature', d: 'easy' },
  { q: 'What is the tallest animal in the world?', a: 'The giraffe', cat: 'nature', d: 'easy' },
  { q: 'What is a group of lions called?', a: 'A pride', cat: 'nature', d: 'med' },
  { q: 'What is the only mammal capable of true flight?', a: 'The bat', cat: 'nature', d: 'med' },
  { q: 'What is the largest species of fish?', a: 'The whale shark', cat: 'nature', d: 'med' },
  { q: 'Which marine animal has three hearts?', a: 'The octopus', cat: 'nature', d: 'hard' },
  { q: 'A group of crows is known as a what?', a: 'A murder', cat: 'nature', d: 'hard' },
  { q: 'Komodo dragons are native to which country?', a: 'Indonesia', cat: 'nature', d: 'hard' },
  { q: 'What is a group of owls called?', a: 'A parliament', cat: 'nature', d: 'expert' },
  { q: 'What is the only venomous primate?', a: 'The slow loris', cat: 'nature', d: 'impossible' },

  // --- Sport --------------------------------------------------------------
  { q: 'In which sport would you perform a slam dunk?', a: 'Basketball', cat: 'sport', d: 'basic' },
  { q: 'In which sport do outfield players move the ball with their feet, not their hands?', a: 'Football (soccer)', cat: 'sport', d: 'basic' },
  { q: 'How many players from one team are on the field in football (soccer)?', a: 'Eleven', cat: 'sport', d: 'easy' },
  { q: 'How many rings are on the Olympic flag?', a: 'Five', cat: 'sport', d: 'easy' },
  { q: 'How many years apart are the Summer Olympic Games held?', a: 'Four', cat: 'sport', d: 'easy' },
  { q: 'In tennis, what is a score of zero called?', a: 'Love', cat: 'sport', d: 'med' },
  { q: 'Which country has won the most men’s FIFA World Cups?', a: 'Brazil', cat: 'sport', d: 'med' },
  { q: 'How many players from one team are on a basketball court?', a: 'Five', cat: 'sport', d: 'med' },
  { q: 'How many players are in a cricket team?', a: 'Eleven', cat: 'sport', d: 'med' },
  { q: 'In golf, what is a score of one stroke under par on a hole called?', a: 'A birdie', cat: 'sport', d: 'hard' },
  { q: 'How many points is a touchdown worth in American football?', a: 'Six', cat: 'sport', d: 'hard' },
  { q: 'Which city hosted the first modern Olympic Games in 1896?', a: 'Athens', cat: 'sport', d: 'hard' },
  { q: 'In snooker, how many points is potting the black ball worth?', a: 'Seven', cat: 'sport', d: 'expert' },
  { q: 'What is the highest possible break in a single frame of snooker?', a: '147', cat: 'sport', d: 'impossible' },

  // --- Music --------------------------------------------------------------
  { q: 'How many strings does a standard guitar have?', a: 'Six', cat: 'music', d: 'basic' },
  { q: 'What do you call the words of a song?', a: 'Lyrics', cat: 'music', d: 'basic' },
  { q: 'Which instrument has 88 keys?', a: 'The piano', cat: 'music', d: 'easy' },
  { q: 'Which singer is known as the “King of Pop”?', a: 'Michael Jackson', cat: 'music', d: 'easy' },
  { q: 'How many musicians make up a quartet?', a: 'Four', cat: 'music', d: 'easy' },
  { q: 'The Beatles formed in which English city?', a: 'Liverpool', cat: 'music', d: 'med' },
  { q: 'To which family of instruments does the trumpet belong?', a: 'Brass', cat: 'music', d: 'med' },
  { q: 'Which composer wrote his Ninth Symphony (“Ode to Joy”) while deaf?', a: 'Beethoven', cat: 'music', d: 'med' },
  { q: 'In music, what does “a cappella” mean?', a: 'Singing without instruments', cat: 'music', d: 'med' },
  { q: 'How many lines make up a musical stave (staff)?', a: 'Five', cat: 'music', d: 'hard' },
  { q: 'Who composed “The Four Seasons”?', a: 'Antonio Vivaldi', cat: 'music', d: 'hard' },
  { q: 'Which Italian musical term means to play loudly?', a: 'Forte', cat: 'music', d: 'hard' },
  { q: 'Which composer wrote the opera “The Magic Flute”?', a: 'Wolfgang Amadeus Mozart', cat: 'music', d: 'expert' },
  { q: 'Which Italian tempo marking means very slow — slower than adagio?', a: 'Largo', cat: 'music', d: 'impossible' },

  // --- Movies & TV --------------------------------------------------------
  { q: 'What kind of animal is the cartoon character Mickey Mouse?', a: 'A mouse', cat: 'film', d: 'basic' },
  { q: 'What colour is the ogre Shrek?', a: 'Green', cat: 'film', d: 'basic' },
  { q: 'What is the name of the lost clownfish in the Pixar film “Finding Nemo”?', a: 'Nemo', cat: 'film', d: 'basic' },
  { q: 'Which young wizard attends Hogwarts School of Witchcraft and Wizardry?', a: 'Harry Potter', cat: 'film', d: 'easy' },
  { q: 'In “The Lion King,” what is the name of the lion cub who becomes king?', a: 'Simba', cat: 'film', d: 'easy' },
  { q: 'What is the highest film honour awarded by the Academy?', a: 'An Oscar (Academy Award)', cat: 'film', d: 'easy' },
  { q: 'Who directed the films “Jaws” and “E.T.”?', a: 'Steven Spielberg', cat: 'film', d: 'med' },
  { q: 'Which 1997 film about a sinking ship won 11 Academy Awards?', a: 'Titanic', cat: 'film', d: 'med' },
  { q: 'Which actor played Captain Jack Sparrow in “Pirates of the Caribbean”?', a: 'Johnny Depp', cat: 'film', d: 'med' },
  { q: 'In “Star Wars,” what is the name of Han Solo’s ship?', a: 'The Millennium Falcon', cat: 'film', d: 'med' },
  { q: 'Which director made “Pulp Fiction” and “Kill Bill”?', a: 'Quentin Tarantino', cat: 'film', d: 'hard' },
  { q: 'Which was the first feature-length animated film released by Disney?', a: 'Snow White and the Seven Dwarfs', cat: 'film', d: 'hard' },
  { q: 'Who directed the 1968 film “2001: A Space Odyssey”?', a: 'Stanley Kubrick', cat: 'film', d: 'expert' },
  { q: 'Which film won the very first Academy Award for Best Picture?', a: 'Wings (1927)', cat: 'film', d: 'impossible' },

  // --- Art & Books --------------------------------------------------------
  { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', cat: 'arts', d: 'basic' },
  { q: 'Who wrote the play “Romeo and Juliet”?', a: 'William Shakespeare', cat: 'arts', d: 'basic' },
  { q: 'Who wrote the “Harry Potter” book series?', a: 'J.K. Rowling', cat: 'arts', d: 'easy' },
  { q: 'Which Dutch painter cut off part of his own ear?', a: 'Vincent van Gogh', cat: 'arts', d: 'easy' },
  { q: 'In Greek mythology, who is the king of the gods?', a: 'Zeus', cat: 'arts', d: 'easy' },
  { q: 'Who painted the ceiling of the Sistine Chapel?', a: 'Michelangelo', cat: 'arts', d: 'med' },
  { q: 'Who wrote “Pride and Prejudice”?', a: 'Jane Austen', cat: 'arts', d: 'med' },
  { q: 'Who is traditionally credited with writing the Iliad and the Odyssey?', a: 'Homer', cat: 'arts', d: 'med' },
  { q: 'In which Paris museum does the Mona Lisa hang?', a: 'The Louvre', cat: 'arts', d: 'med' },
  { q: 'Which Spanish artist co-founded the Cubism movement?', a: 'Pablo Picasso', cat: 'arts', d: 'hard' },
  { q: 'Which Russian author wrote “War and Peace”?', a: 'Leo Tolstoy', cat: 'arts', d: 'hard' },
  { q: 'Who wrote the novels “1984” and “Animal Farm”?', a: 'George Orwell', cat: 'arts', d: 'hard' },
  { q: 'Which Russian author wrote “Crime and Punishment”?', a: 'Fyodor Dostoevsky', cat: 'arts', d: 'expert' },
  { q: 'Which French author wrote the novel “In Search of Lost Time”?', a: 'Marcel Proust', cat: 'arts', d: 'impossible' },

  // --- Food & Drink -------------------------------------------------------
  { q: 'Which fruit is traditionally used to make wine?', a: 'Grapes', cat: 'food', d: 'basic' },
  { q: 'What is the main ingredient of bread?', a: 'Flour', cat: 'food', d: 'basic' },
  { q: 'What is the main ingredient in guacamole?', a: 'Avocado', cat: 'food', d: 'easy' },
  { q: 'Sushi is a traditional dish from which country?', a: 'Japan', cat: 'food', d: 'easy' },
  { q: 'What is the main ingredient in hummus?', a: 'Chickpeas', cat: 'food', d: 'med' },
  { q: 'Which nut is used to make marzipan?', a: 'Almonds', cat: 'food', d: 'med' },
  { q: 'The dish paella originates from which country?', a: 'Spain', cat: 'food', d: 'med' },
  { q: 'What is tofu made from?', a: 'Soybeans', cat: 'food', d: 'med' },
  { q: 'Which spice, taken from a crocus flower, is the most expensive by weight?', a: 'Saffron', cat: 'food', d: 'hard' },
  { q: 'Which type of pastry is used to make profiteroles?', a: 'Choux pastry', cat: 'food', d: 'hard' },
  { q: 'Champagne can only come from which region of France?', a: 'Champagne', cat: 'food', d: 'hard' },
  { q: 'The spice cinnamon comes from which part of a tree?', a: 'The bark', cat: 'food', d: 'expert' },
  { q: 'Traditional Roquefort cheese is made from the milk of which animal?', a: 'Sheep', cat: 'food', d: 'impossible' },

  // --- Words & Language ---------------------------------------------------
  { q: 'How many letters are in the English alphabet?', a: '26', cat: 'words', d: 'basic' },
  { q: 'Which punctuation mark ends a question?', a: 'A question mark', cat: 'words', d: 'basic' },
  { q: 'What do you call a word that means the opposite of another?', a: 'An antonym', cat: 'words', d: 'easy' },
  { q: 'What is the first letter of the Greek alphabet?', a: 'Alpha', cat: 'words', d: 'easy' },
  { q: 'A word that reads the same forwards and backwards is called a what?', a: 'A palindrome', cat: 'words', d: 'med' },
  { q: 'Which language has the most native speakers in the world?', a: 'Mandarin Chinese', cat: 'words', d: 'med' },
  { q: 'The phrase “et cetera” comes from which ancient language?', a: 'Latin', cat: 'words', d: 'med' },
  { q: 'A comparison using “like” or “as,” such as “as brave as a lion,” is called a what?', a: 'A simile', cat: 'words', d: 'med' },
  { q: 'In grammar, what do you call a word that describes a verb?', a: 'An adverb', cat: 'words', d: 'hard' },
  { q: 'What do you call words that sound alike but differ in meaning, like “their” and “there”?', a: 'Homophones', cat: 'words', d: 'hard' },
  { q: 'What is the term for a newly coined word entering a language?', a: 'A neologism', cat: 'words', d: 'expert' },
  { q: 'What is the only common English word that ends in the letters “-mt”?', a: 'Dreamt', cat: 'words', d: 'impossible' },

  // --- Maths & Numbers ----------------------------------------------------
  { q: 'How many sides does a hexagon have?', a: 'Six', cat: 'math', d: 'basic' },
  { q: 'What is half of 54?', a: '27', cat: 'math', d: 'basic' },
  { q: 'What is 7 times 8?', a: '56', cat: 'math', d: 'basic' },
  { q: 'What is 15% of 200?', a: '30', cat: 'math', d: 'basic' },
  { q: 'How many degrees are there in a right angle?', a: '90', cat: 'math', d: 'easy' },
  { q: 'How many degrees are there in a full circle?', a: '360', cat: 'math', d: 'easy' },
  { q: 'What is the third digit of pi?', a: '4 (π ≈ 3.14)', cat: 'math', d: 'easy' },
  { q: 'What is 20% of 160?', a: '32', cat: 'math', d: 'med' },
  { q: 'What is the fourth digit of pi?', a: '1 (π ≈ 3.14159)', cat: 'math', d: 'med' },
  { q: 'What do you call a number divisible only by 1 and itself?', a: 'A prime number', cat: 'math', d: 'med' },
  { q: 'What is the square root of 144?', a: '12', cat: 'math', d: 'med' },
  { q: 'The interior angles of a triangle add up to how many degrees?', a: '180', cat: 'math', d: 'med' },
  { q: 'What is the only even prime number?', a: '2', cat: 'math', d: 'med' },
  { q: 'Rounded to one decimal place, what is the square root of 2?', a: '1.4 (√2 ≈ 1.414)', cat: 'math', d: 'med' },
  { q: 'What is 2 to the power of 4?', a: '16', cat: 'math', d: 'med' },
  { q: 'In Roman numerals, which number is written as “C”?', a: '100', cat: 'math', d: 'med' },
  { q: 'What is the Roman numeral for 50?', a: 'L', cat: 'math', d: 'hard' },
  { q: 'What is the square root of 256?', a: '16', cat: 'math', d: 'hard' },
  { q: 'What is the cube root of 1,000,000?', a: '100', cat: 'math', d: 'expert' },
  { q: 'What name is given to the number 1 followed by 100 zeros?', a: 'A googol', cat: 'math', d: 'expert' },
  { q: 'What is the Roman numeral for 500?', a: 'D', cat: 'math', d: 'expert' },
  { q: 'What is 2 to the power of 10?', a: '1,024', cat: 'math', d: 'expert' },
  { q: 'What is the seventh digit of pi?', a: '2 (π ≈ 3.14159265)', cat: 'math', d: 'impossible' },

  // --- General Knowledge --------------------------------------------------
  { q: 'Which planet is known as the Red Planet?', a: 'Mars', cat: 'general', d: 'basic' },
  { q: 'How many months have 31 days?', a: '7', cat: 'general', d: 'basic' },
  { q: 'What is the currency of the United Kingdom?', a: 'The pound sterling', cat: 'general', d: 'basic' },
  { q: 'What is the third planet from the Sun?', a: 'Earth', cat: 'general', d: 'basic' },
  { q: 'How many colours are traditionally said to be in a rainbow?', a: '7', cat: 'general', d: 'easy' },
  { q: 'How many days are there in a leap year?', a: '366', cat: 'general', d: 'easy' },
  { q: 'How many continents do most people recognize on Earth?', a: '7', cat: 'general', d: 'easy' },
  { q: 'Which is the hottest planet in our solar system?', a: 'Venus', cat: 'general', d: 'med' },
  { q: 'Which planet is sometimes called Earth’s twin because of its similar size and mass?', a: 'Venus', cat: 'general', d: 'med' },
  { q: 'Which is the eighth planet from the Sun?', a: 'Neptune', cat: 'general', d: 'med' },
  { q: 'What is the tallest mountain in Africa?', a: 'Mount Kilimanjaro', cat: 'general', d: 'med' },
  { q: 'What is the currency of Turkey?', a: 'The lira', cat: 'general', d: 'med' },
  { q: 'Which is the largest organ of the human body?', a: 'The skin', cat: 'general', d: 'med' },
  { q: 'What is the largest "gas giant"?', a: 'Jupiter', cat: 'general', d: 'hard' },
  { q: 'Which continent has the most countries?', a: 'Africa', cat: 'general', d: 'hard' },
  { q: 'What is the third most traded currency in the forex market?', a: 'The Japanese yen', cat: 'general', d: 'hard' },
  { q: 'What is the currency of South Korea?', a: 'The won', cat: 'general', d: 'hard' },
  { q: 'What has been the currency of Liechtenstein since 1920?', a: 'The Swiss franc', cat: 'general', d: 'expert' },
  { q: 'Among the 8 standard blood types, which is the rarest?', a: 'AB negative (AB-)', cat: 'general', d: 'expert' },
  { q: 'The renminbi (yuan) is the official currency of China. What does its name literally mean?', a: 'The people’s currency', cat: 'general', d: 'expert' },
  { q: 'Counting its overseas territories, which country spans the most time zones?', a: 'France', cat: 'general', d: 'expert' },
  { q: 'How many time zones does Russia span?', a: '11', cat: 'general', d: 'impossible' },
  { q: 'How many bones are in the adult human body?', a: '206', cat: 'general', d: 'impossible' },
];

/** The whole deck: text questions plus the visual flag questions. */
export const QUESTIONS = [...TEXT_QUESTIONS, ...FLAG_QUESTIONS];
