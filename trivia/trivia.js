// @ts-check

/*
 * Trivia — a flexible question deck the host drives live.
 *
 * Not a game with fixed rules: it's a tool. The host runs whatever they like at
 * the table — a knockout, a category streak, a flags round, or pure
 * winging-it — and the phone is the console that keeps good questions coming
 * with the answer a tap away. It never keeps score; that's far easier between
 * people, and leaving it out is what keeps the host in full control.
 *
 * Steer it as you go: pick any mix of categories and difficulties, and the deck
 * draws from whatever's selected. Changing the selection never disturbs the
 * question on screen — it only shapes what comes next. Nothing repeats until the
 * whole selected pool has been seen this session, then it quietly recycles. Tap
 * the card to reveal the answer (tap again for the next); tap a flag to throw it
 * full-screen for the table.
 *
 * Flags are real SVG files in ./flags/ (the flag-icons set — see flags/
 * CREDITS.md), shown with an <img> so they stay crisp at any size and look the
 * same on every phone. They load on demand; the service worker caches each one
 * as it's viewed, so a flags round you've played once also works offline.
 *
 * Self-contained: this game imports nothing and is the only script on its page.
 * The text bank lives in this file so the service worker (which precaches
 * <id>.js) keeps it playable offline after a single visit to the hub.
 */

/** @typedef {'easy' | 'med' | 'hard'} Difficulty */

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
const CATEGORIES = [
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
  { id: 'numbers', name: 'Maths & Numbers', emoji: '🔢' },
  { id: 'gk', name: 'General Knowledge', emoji: '🧠' },
  { id: 'flags', name: 'Flags', emoji: '🚩' },
];

/** @type {{ id: Difficulty, label: string }[]} */
const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'med', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

/**
 * The flags pool — country plus the SVG stem in ./flags/. Difficulty is by how
 * widely recognised the flag is. Add a row (and drop its <code>.svg in flags/)
 * to extend it.
 *
 * @type {{ code: string, name: string, d: Difficulty }[]}
 */
const FLAGS = [
  { code: 'us', name: 'United States', d: 'easy' },
  { code: 'gb', name: 'United Kingdom', d: 'easy' },
  { code: 'fr', name: 'France', d: 'easy' },
  { code: 'de', name: 'Germany', d: 'easy' },
  { code: 'it', name: 'Italy', d: 'easy' },
  { code: 'es', name: 'Spain', d: 'easy' },
  { code: 'jp', name: 'Japan', d: 'easy' },
  { code: 'cn', name: 'China', d: 'easy' },
  { code: 'ca', name: 'Canada', d: 'easy' },
  { code: 'br', name: 'Brazil', d: 'easy' },
  { code: 'in', name: 'India', d: 'easy' },
  { code: 'ru', name: 'Russia', d: 'easy' },
  { code: 'mx', name: 'Mexico', d: 'easy' },
  { code: 'au', name: 'Australia', d: 'easy' },
  { code: 'nl', name: 'Netherlands', d: 'easy' },
  { code: 'se', name: 'Sweden', d: 'easy' },
  { code: 'ch', name: 'Switzerland', d: 'easy' },
  { code: 'gr', name: 'Greece', d: 'easy' },
  { code: 'ie', name: 'Ireland', d: 'easy' },
  { code: 'pt', name: 'Portugal', d: 'easy' },
  { code: 'no', name: 'Norway', d: 'easy' },
  { code: 'dk', name: 'Denmark', d: 'easy' },
  { code: 'fi', name: 'Finland', d: 'easy' },
  { code: 'kr', name: 'South Korea', d: 'easy' },
  { code: 'ar', name: 'Argentina', d: 'med' },
  { code: 'tr', name: 'Turkey', d: 'med' },
  { code: 'eg', name: 'Egypt', d: 'med' },
  { code: 'za', name: 'South Africa', d: 'med' },
  { code: 'pl', name: 'Poland', d: 'med' },
  { code: 'ua', name: 'Ukraine', d: 'med' },
  { code: 'be', name: 'Belgium', d: 'med' },
  { code: 'at', name: 'Austria', d: 'med' },
  { code: 'id', name: 'Indonesia', d: 'med' },
  { code: 'th', name: 'Thailand', d: 'med' },
  { code: 'vn', name: 'Vietnam', d: 'med' },
  { code: 'sa', name: 'Saudi Arabia', d: 'med' },
  { code: 'ng', name: 'Nigeria', d: 'med' },
  { code: 'ke', name: 'Kenya', d: 'med' },
  { code: 'ma', name: 'Morocco', d: 'med' },
  { code: 'cl', name: 'Chile', d: 'med' },
  { code: 'pe', name: 'Peru', d: 'med' },
  { code: 'co', name: 'Colombia', d: 'med' },
  { code: 'ph', name: 'Philippines', d: 'med' },
  { code: 'my', name: 'Malaysia', d: 'med' },
  { code: 'sg', name: 'Singapore', d: 'med' },
  { code: 'nz', name: 'New Zealand', d: 'med' },
  { code: 'il', name: 'Israel', d: 'med' },
  { code: 'cz', name: 'Czechia', d: 'med' },
  { code: 'hu', name: 'Hungary', d: 'med' },
  { code: 'ro', name: 'Romania', d: 'med' },
  { code: 'is', name: 'Iceland', d: 'med' },
  { code: 'jm', name: 'Jamaica', d: 'med' },
  { code: 'bd', name: 'Bangladesh', d: 'hard' },
  { code: 'lk', name: 'Sri Lanka', d: 'hard' },
  { code: 'np', name: 'Nepal', d: 'hard' },
  { code: 'kz', name: 'Kazakhstan', d: 'hard' },
  { code: 'gh', name: 'Ghana', d: 'hard' },
  { code: 'et', name: 'Ethiopia', d: 'hard' },
  { code: 'qa', name: 'Qatar', d: 'hard' },
  { code: 'ae', name: 'United Arab Emirates', d: 'hard' },
  { code: 'uy', name: 'Uruguay', d: 'hard' },
  { code: 'ec', name: 'Ecuador', d: 'hard' },
  { code: 've', name: 'Venezuela', d: 'hard' },
  { code: 'hr', name: 'Croatia', d: 'hard' },
  { code: 'rs', name: 'Serbia', d: 'hard' },
  { code: 'bg', name: 'Bulgaria', d: 'hard' },
  { code: 'sk', name: 'Slovakia', d: 'hard' },
  { code: 'lt', name: 'Lithuania', d: 'hard' },
  { code: 'lv', name: 'Latvia', d: 'hard' },
  { code: 'ee', name: 'Estonia', d: 'hard' },
  { code: 'si', name: 'Slovenia', d: 'hard' },
  { code: 'pk', name: 'Pakistan', d: 'hard' },
  { code: 'cu', name: 'Cuba', d: 'hard' },
  { code: 'pa', name: 'Panama', d: 'hard' },
  { code: 'tn', name: 'Tunisia', d: 'hard' },
  { code: 'by', name: 'Belarus', d: 'hard' },
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
 * Skewed towards easy/medium so most questions are gettable, with a sprinkle of
 * hard ones to break ties. Grow it freely: add a `{ q, a, cat, d }` row.
 *
 * @type {Question[]}
 */
const TEXT_QUESTIONS = [
  // --- Geography ----------------------------------------------------------
  { q: 'What is the capital of France?', a: 'Paris', cat: 'geo', d: 'easy' },
  { q: 'What is the capital of Italy?', a: 'Rome', cat: 'geo', d: 'easy' },
  { q: 'Which is the largest ocean on Earth?', a: 'The Pacific Ocean', cat: 'geo', d: 'easy' },
  { q: 'Which continent is Egypt mostly located in?', a: 'Africa', cat: 'geo', d: 'easy' },
  { q: 'What is the capital of Spain?', a: 'Madrid', cat: 'geo', d: 'easy' },
  { q: 'Which is the largest country in the world by area?', a: 'Russia', cat: 'geo', d: 'med' },
  { q: 'What is the capital of Australia?', a: 'Canberra', cat: 'geo', d: 'med' },
  { q: 'Mount Kilimanjaro is in which country?', a: 'Tanzania', cat: 'geo', d: 'med' },
  { q: 'Which is the largest hot desert in the world?', a: 'The Sahara', cat: 'geo', d: 'med' },
  { q: 'What is the smallest country in the world by area?', a: 'Vatican City', cat: 'geo', d: 'med' },
  { q: 'What is the capital of Canada?', a: 'Ottawa', cat: 'geo', d: 'hard' },
  { q: 'What is the capital of New Zealand?', a: 'Wellington', cat: 'geo', d: 'hard' },
  { q: 'Lake Titicaca lies between which two countries?', a: 'Peru and Bolivia', cat: 'geo', d: 'hard' },
  { q: 'Which African country was formerly known as Abyssinia?', a: 'Ethiopia', cat: 'geo', d: 'hard' },
  { q: 'What is the capital of Mongolia?', a: 'Ulaanbaatar', cat: 'geo', d: 'hard' },

  // --- History ------------------------------------------------------------
  { q: 'Who was the first President of the United States?', a: 'George Washington', cat: 'hist', d: 'easy' },
  { q: 'In which year did World War II end?', a: '1945', cat: 'hist', d: 'easy' },
  { q: 'Who was the first person to walk on the Moon?', a: 'Neil Armstrong', cat: 'hist', d: 'easy' },
  { q: 'Who was the British Prime Minister during most of World War II?', a: 'Winston Churchill', cat: 'hist', d: 'med' },
  { q: 'In which year did the Berlin Wall fall?', a: '1989', cat: 'hist', d: 'med' },
  { q: 'Which civilization built the city of Machu Picchu?', a: 'The Inca', cat: 'hist', d: 'med' },
  { q: 'In which year did the Titanic sink?', a: '1912', cat: 'hist', d: 'med' },
  { q: 'In which year did the French Revolution begin?', a: '1789', cat: 'hist', d: 'hard' },
  { q: 'Which English queen reigned when the Spanish Armada was defeated in 1588?', a: 'Elizabeth I', cat: 'hist', d: 'hard' },
  { q: 'Who was the first Emperor of Rome?', a: 'Augustus (Octavian)', cat: 'hist', d: 'hard' },
  { q: 'In which year was the Magna Carta sealed?', a: '1215', cat: 'hist', d: 'hard' },
  { q: 'Hannibal famously crossed the Alps using which animals?', a: 'Elephants', cat: 'hist', d: 'hard' },

  // --- Science ------------------------------------------------------------
  { q: 'What is the chemical formula for water?', a: 'H₂O', cat: 'sci', d: 'easy' },
  { q: 'Which gas do plants take from the air for photosynthesis?', a: 'Carbon dioxide', cat: 'sci', d: 'easy' },
  { q: 'How many planets are in our solar system?', a: 'Eight', cat: 'sci', d: 'easy' },
  { q: 'What is the chemical symbol for gold?', a: 'Au', cat: 'sci', d: 'med' },
  { q: 'What is the hardest known natural material?', a: 'Diamond', cat: 'sci', d: 'med' },
  { q: 'Which part of a cell contains its DNA?', a: 'The nucleus', cat: 'sci', d: 'med' },
  { q: 'What force pulls objects towards the centre of the Earth?', a: 'Gravity', cat: 'sci', d: 'med' },
  { q: 'What is the most abundant gas in Earth’s atmosphere?', a: 'Nitrogen', cat: 'sci', d: 'med' },
  { q: 'What is the chemical symbol for sodium?', a: 'Na', cat: 'sci', d: 'hard' },
  { q: 'Who proposed the theory of general relativity?', a: 'Albert Einstein', cat: 'sci', d: 'hard' },
  { q: 'Which subatomic particle carries a negative electric charge?', a: 'The electron', cat: 'sci', d: 'hard' },
  { q: 'Roughly how fast does light travel, in kilometres per second?', a: 'About 300,000 km/s', cat: 'sci', d: 'hard' },

  // --- Animals & Nature ---------------------------------------------------
  { q: 'What is the largest land animal?', a: 'The African elephant', cat: 'nature', d: 'easy' },
  { q: 'What is the fastest land animal?', a: 'The cheetah', cat: 'nature', d: 'easy' },
  { q: 'How many legs does a spider have?', a: 'Eight', cat: 'nature', d: 'easy' },
  { q: 'What is the largest animal ever known to have lived?', a: 'The blue whale', cat: 'nature', d: 'med' },
  { q: 'What is a group of lions called?', a: 'A pride', cat: 'nature', d: 'med' },
  { q: 'What do you call an animal that eats only plants?', a: 'A herbivore', cat: 'nature', d: 'med' },
  { q: 'What is the only mammal capable of true flight?', a: 'The bat', cat: 'nature', d: 'med' },
  { q: 'What is the tallest animal in the world?', a: 'The giraffe', cat: 'nature', d: 'med' },
  { q: 'Which marine animal has three hearts?', a: 'The octopus', cat: 'nature', d: 'hard' },
  { q: 'A group of crows is known as a what?', a: 'A murder', cat: 'nature', d: 'hard' },
  { q: 'What is the largest species of fish?', a: 'The whale shark', cat: 'nature', d: 'hard' },
  { q: 'Komodo dragons are native to which country?', a: 'Indonesia', cat: 'nature', d: 'hard' },

  // --- Sport --------------------------------------------------------------
  { q: 'How many players from one team are on the field in football (soccer)?', a: 'Eleven', cat: 'sport', d: 'easy' },
  { q: 'In which sport would you perform a slam dunk?', a: 'Basketball', cat: 'sport', d: 'easy' },
  { q: 'How many rings are on the Olympic flag?', a: 'Five', cat: 'sport', d: 'easy' },
  { q: 'In tennis, what is a score of zero called?', a: 'Love', cat: 'sport', d: 'med' },
  { q: 'How many years apart are the Summer Olympic Games held?', a: 'Four', cat: 'sport', d: 'med' },
  { q: 'Which country has won the most men’s FIFA World Cups?', a: 'Brazil', cat: 'sport', d: 'med' },
  { q: 'How many players from one team are on a basketball court?', a: 'Five', cat: 'sport', d: 'med' },
  { q: 'In golf, what is a score of one stroke under par on a hole called?', a: 'A birdie', cat: 'sport', d: 'hard' },
  { q: 'How many points is a touchdown worth in American football?', a: 'Six', cat: 'sport', d: 'hard' },
  { q: 'Which city hosted the first modern Olympic Games in 1896?', a: 'Athens', cat: 'sport', d: 'hard' },
  { q: 'How many players are in a cricket team?', a: 'Eleven', cat: 'sport', d: 'hard' },

  // --- Music --------------------------------------------------------------
  { q: 'How many strings does a standard guitar have?', a: 'Six', cat: 'music', d: 'easy' },
  { q: 'Which instrument has 88 keys?', a: 'The piano', cat: 'music', d: 'easy' },
  { q: 'The Beatles formed in which English city?', a: 'Liverpool', cat: 'music', d: 'med' },
  { q: 'Which singer is known as the “King of Pop”?', a: 'Michael Jackson', cat: 'music', d: 'med' },
  { q: 'How many musicians make up a quartet?', a: 'Four', cat: 'music', d: 'med' },
  { q: 'To which family of instruments does the trumpet belong?', a: 'Brass', cat: 'music', d: 'med' },
  { q: 'Which composer wrote his Ninth Symphony (“Ode to Joy”) while deaf?', a: 'Beethoven', cat: 'music', d: 'hard' },
  { q: 'Who composed “The Four Seasons”?', a: 'Antonio Vivaldi', cat: 'music', d: 'hard' },
  { q: 'In music, what does “a cappella” mean?', a: 'Singing without instruments', cat: 'music', d: 'hard' },
  { q: 'Which Italian musical term means to play loudly?', a: 'Forte', cat: 'music', d: 'hard' },

  // --- Movies & TV --------------------------------------------------------
  { q: 'What kind of animal is the cartoon character Mickey Mouse?', a: 'A mouse', cat: 'film', d: 'easy' },
  { q: 'What colour is the ogre Shrek?', a: 'Green', cat: 'film', d: 'easy' },
  { q: 'Which young wizard attends Hogwarts School of Witchcraft and Wizardry?', a: 'Harry Potter', cat: 'film', d: 'easy' },
  { q: 'Who directed the films “Jaws” and “E.T.”?', a: 'Steven Spielberg', cat: 'film', d: 'med' },
  { q: 'In “The Lion King,” what is the name of the lion cub who becomes king?', a: 'Simba', cat: 'film', d: 'med' },
  { q: 'What is the highest film honour awarded by the Academy?', a: 'An Oscar (Academy Award)', cat: 'film', d: 'med' },
  { q: 'Which 1997 film about a sinking ship won 11 Academy Awards?', a: 'Titanic', cat: 'film', d: 'hard' },
  { q: 'Which actor played Captain Jack Sparrow in “Pirates of the Caribbean”?', a: 'Johnny Depp', cat: 'film', d: 'hard' },
  { q: 'In “Star Wars,” what is the name of Han Solo’s ship?', a: 'The Millennium Falcon', cat: 'film', d: 'hard' },
  { q: 'Which director made “Pulp Fiction” and “Kill Bill”?', a: 'Quentin Tarantino', cat: 'film', d: 'hard' },

  // --- Art & Books --------------------------------------------------------
  { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', cat: 'arts', d: 'easy' },
  { q: 'Who wrote the play “Romeo and Juliet”?', a: 'William Shakespeare', cat: 'arts', d: 'easy' },
  { q: 'Who wrote the “Harry Potter” book series?', a: 'J.K. Rowling', cat: 'arts', d: 'easy' },
  { q: 'Who painted the ceiling of the Sistine Chapel?', a: 'Michelangelo', cat: 'arts', d: 'med' },
  { q: 'Which Dutch painter cut off part of his own ear?', a: 'Vincent van Gogh', cat: 'arts', d: 'med' },
  { q: 'Who wrote “Pride and Prejudice”?', a: 'Jane Austen', cat: 'arts', d: 'med' },
  { q: 'In Greek mythology, who is the king of the gods?', a: 'Zeus', cat: 'arts', d: 'med' },
  { q: 'Which Spanish artist co-founded the Cubism movement?', a: 'Pablo Picasso', cat: 'arts', d: 'hard' },
  { q: 'Who is traditionally credited with writing the Iliad and the Odyssey?', a: 'Homer', cat: 'arts', d: 'hard' },
  { q: 'Which Russian author wrote “War and Peace”?', a: 'Leo Tolstoy', cat: 'arts', d: 'hard' },
  { q: 'Who wrote the novels “1984” and “Animal Farm”?', a: 'George Orwell', cat: 'arts', d: 'hard' },

  // --- Food & Drink -------------------------------------------------------
  { q: 'Which fruit is traditionally used to make wine?', a: 'Grapes', cat: 'food', d: 'easy' },
  { q: 'What is the main ingredient in guacamole?', a: 'Avocado', cat: 'food', d: 'easy' },
  { q: 'Sushi is a traditional dish from which country?', a: 'Japan', cat: 'food', d: 'easy' },
  { q: 'Which spice, taken from a crocus flower, is the most expensive by weight?', a: 'Saffron', cat: 'food', d: 'med' },
  { q: 'What is the main ingredient in hummus?', a: 'Chickpeas', cat: 'food', d: 'med' },
  { q: 'Which nut is used to make marzipan?', a: 'Almonds', cat: 'food', d: 'med' },
  { q: 'The dish paella originates from which country?', a: 'Spain', cat: 'food', d: 'med' },
  { q: 'What is tofu made from?', a: 'Soybeans', cat: 'food', d: 'hard' },
  { q: 'Which type of pastry is used to make profiteroles?', a: 'Choux pastry', cat: 'food', d: 'hard' },
  { q: 'Champagne can only come from which region of France?', a: 'Champagne', cat: 'food', d: 'hard' },

  // --- Words & Language ---------------------------------------------------
  { q: 'How many letters are in the English alphabet?', a: '26', cat: 'words', d: 'easy' },
  { q: 'What do you call a word that means the opposite of another?', a: 'An antonym', cat: 'words', d: 'easy' },
  { q: 'A word that reads the same forwards and backwards is called a what?', a: 'A palindrome', cat: 'words', d: 'med' },
  { q: 'Which language has the most native speakers in the world?', a: 'Mandarin Chinese', cat: 'words', d: 'med' },
  { q: 'The phrase “et cetera” comes from which ancient language?', a: 'Latin', cat: 'words', d: 'med' },
  { q: 'In grammar, what do you call a word that describes a verb?', a: 'An adverb', cat: 'words', d: 'hard' },
  { q: 'What is the first letter of the Greek alphabet?', a: 'Alpha', cat: 'words', d: 'hard' },
  { q: 'What is the term for a newly coined word entering a language?', a: 'A neologism', cat: 'words', d: 'hard' },

  // --- Maths & Numbers ----------------------------------------------------
  { q: 'What is 7 times 8?', a: '56', cat: 'numbers', d: 'easy' },
  { q: 'How many sides does a hexagon have?', a: 'Six', cat: 'numbers', d: 'easy' },
  { q: 'What is half of 50?', a: '25', cat: 'numbers', d: 'easy' },
  { q: 'What is the value of pi to two decimal places?', a: '3.14', cat: 'numbers', d: 'med' },
  { q: 'How many degrees are there in a right angle?', a: '90', cat: 'numbers', d: 'med' },
  { q: 'What do you call a number divisible only by 1 and itself?', a: 'A prime number', cat: 'numbers', d: 'med' },
  { q: 'What is the square root of 144?', a: '12', cat: 'numbers', d: 'med' },
  { q: 'The interior angles of a triangle add up to how many degrees?', a: '180', cat: 'numbers', d: 'hard' },
  { q: 'In Roman numerals, which number is written as “C”?', a: '100', cat: 'numbers', d: 'hard' },
  { q: 'What is the next prime number after 7?', a: '11', cat: 'numbers', d: 'hard' },
  { q: 'What is 15% of 200?', a: '30', cat: 'numbers', d: 'hard' },

  // --- General Knowledge --------------------------------------------------
  { q: 'How many colours are traditionally said to be in a rainbow?', a: 'Seven', cat: 'gk', d: 'easy' },
  { q: 'Which planet is known as the Red Planet?', a: 'Mars', cat: 'gk', d: 'easy' },
  { q: 'How many days are there in a leap year?', a: '366', cat: 'gk', d: 'easy' },
  { q: 'How many bones are in the adult human body?', a: '206', cat: 'gk', d: 'med' },
  { q: 'What is the currency of Japan?', a: 'The yen', cat: 'gk', d: 'med' },
  { q: 'How many continents are there on Earth?', a: 'Seven', cat: 'gk', d: 'med' },
  { q: 'What is the tallest mountain on Earth above sea level?', a: 'Mount Everest', cat: 'gk', d: 'med' },
  { q: 'What is the largest organ of the human body?', a: 'The skin', cat: 'gk', d: 'hard' },
  { q: 'Which is the largest planet in our solar system?', a: 'Jupiter', cat: 'gk', d: 'hard' },
  { q: 'How many time zones does Russia span?', a: 'Eleven', cat: 'gk', d: 'hard' },
  { q: 'What is the process by which plants make their food using sunlight?', a: 'Photosynthesis', cat: 'gk', d: 'hard' },
];

/** The whole deck: text questions plus the visual flag questions. */
const QUESTIONS = [...TEXT_QUESTIONS, ...FLAG_QUESTIONS];

// ---------------------------------------------------------------------------

const STORAGE_KEY = 'trivia.v1';

/**
 * @typedef {Object} GameState
 * @property {'home' | 'play'} phase
 * @property {Set<string>} cats         Categories in play (multi-select).
 * @property {Set<Difficulty>} diffs    Difficulty tiers in play.
 * @property {Question | null} current  The question on screen.
 * @property {boolean} revealed         Whether its answer is showing.
 * @property {boolean} presenting       Whether the visual is shown full-screen.
 * @property {number} asked             Count of questions dealt this session.
 * @property {Set<Question>} seen        Dealt this session — never repeated until recycled.
 * @property {Difficulty[]} lastDiffs    Last two tiers dealt, to keep the mix varied.
 */

/** @type {GameState} */
const state = {
  phase: 'home',
  cats: new Set(CATEGORIES.map((c) => c.id)),
  diffs: new Set(DIFFICULTIES.map((d) => d.id)),
  current: null,
  revealed: false,
  presenting: false,
  asked: 0,
  seen: new Set(),
  lastDiffs: [],
};

const app = /** @type {HTMLElement} */ (document.getElementById('app'));

// --- pure helpers (DOM-free) -----------------------------------------------

/** @param {number} n @returns {number} A random integer in [0, n). */
function randInt(n) {
  return Math.floor(Math.random() * n);
}

/** Questions matching the selected categories and difficulties. */
function eligiblePool() {
  return QUESTIONS.filter((q) => state.cats.has(q.cat) && state.diffs.has(q.d));
}

/**
 * Pick the next question. Nothing in the selected pool is dealt twice in a
 * session until the whole pool has been seen, at which point it recycles
 * (minus the current one, to avoid an immediate repeat). A light touch keeps
 * the difficulties from clumping. Returns null only if nothing is selected.
 *
 * @returns {Question | null}
 */
function pickNext() {
  const pool = eligiblePool();
  if (pool.length === 0) return null;

  let fresh = pool.filter((q) => !state.seen.has(q));
  if (fresh.length === 0) {
    for (const q of pool) state.seen.delete(q); // whole pool seen — recycle it
    fresh = state.current && pool.length > 1 ? pool.filter((q) => q !== state.current) : pool.slice();
  }

  // Don't deal a third of the same tier in a row if another tier is available.
  const n = state.lastDiffs.length;
  if (n >= 2 && state.lastDiffs[n - 1] === state.lastDiffs[n - 2]) {
    const spread = fresh.filter((q) => q.d !== state.lastDiffs[n - 1]);
    if (spread.length) fresh = spread;
  }

  return fresh[randInt(fresh.length)];
}

/** Deal a fresh question, recording it so the session won't repeat it. */
function deal() {
  const q = pickNext();
  state.current = q;
  state.revealed = false;
  state.presenting = false;
  if (!q) return;

  state.seen.add(q);
  state.asked += 1;
  state.lastDiffs.push(q.d);
  if (state.lastDiffs.length > 2) state.lastDiffs.shift();
}

// --- persistence -----------------------------------------------------------

/** Save the host's standing preferences (categories + difficulty). */
function save() {
  try {
    const data = { cats: [...state.cats], diffs: [...state.diffs] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable; the game still works fully in memory.
  }
}

/** Restore preferences, ignoring anything stale or unknown. */
function load() {
  let data;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (!data || typeof data !== 'object') return;

  const validCats = new Set(CATEGORIES.map((c) => c.id));
  if (Array.isArray(data.cats)) {
    state.cats = new Set(data.cats.filter((id) => validCats.has(id)));
  }
  const validDiffs = new Set(DIFFICULTIES.map((d) => d.id));
  if (Array.isArray(data.diffs)) {
    const diffs = data.diffs.filter((id) => validDiffs.has(id));
    if (diffs.length) state.diffs = new Set(diffs);
  }
}

// --- DOM helpers -----------------------------------------------------------

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Make a node behave as a tap target (pointer + keyboard activation).
 *
 * @param {HTMLElement} node
 * @param {() => void} onActivate
 * @returns {HTMLElement}
 */
function makeTappable(node, onActivate) {
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.addEventListener('click', onActivate);
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });
  return node;
}

/**
 * A small three-dot difficulty meter (●○○ easy → ●●● hard).
 *
 * @param {Difficulty} d
 * @returns {HTMLElement}
 */
function difficultyDots(d) {
  const filled = d === 'easy' ? 1 : d === 'med' ? 2 : 3;
  const wrap = el('span', 'meter');
  wrap.setAttribute('aria-label', `Difficulty: ${d === 'med' ? 'medium' : d}`);
  for (let i = 0; i < 3; i++) {
    wrap.append(el('span', `meter__dot${i < filled ? ' meter__dot--on' : ''}`));
  }
  return wrap;
}

/**
 * A row of multi-select toggle chips. Toggling only updates `selected` and
 * re-renders — it never deals a new question, so the host can adjust the mix
 * without disturbing what's on screen.
 *
 * @param {{ id: string, label: string }[]} options
 * @param {Set<string>} selected
 * @param {{ minOne?: boolean }} [opts]
 * @returns {HTMLElement}
 */
function chipRow(options, selected, opts) {
  const row = el('div', 'chips');
  for (const o of options) {
    const on = selected.has(o.id);
    const chip = el('button', `chip${on ? ' chip--on' : ''}`, o.label);
    chip.setAttribute('type', 'button');
    chip.setAttribute('aria-pressed', String(on));
    chip.addEventListener('click', () => {
      if (selected.has(o.id)) {
        if (opts?.minOne && selected.size === 1) return;
        selected.delete(o.id);
      } else {
        selected.add(o.id);
      }
      save();
      render();
    });
    row.append(chip);
  }
  return row;
}

// --- screens ---------------------------------------------------------------

/** Home: a one-line framing, then into the console. */
function renderHome() {
  const screen = el('section', 'screen');

  screen.append(el('h1', 'screen__title', 'Trivia'));

  const howto = /** @type {HTMLAnchorElement} */ (el('a', 'screen__howto', 'How to play →'));
  howto.href = 'how-to-play.html';
  screen.append(howto);

  screen.append(
    el('p', 'screen__lede', 'You host; the phone deals. Run a knockout, a category streak, a flags round — whatever you like.'),
  );

  const start = el('button', 'btn', 'Start');
  start.addEventListener('click', () => {
    state.asked = 0;
    state.seen = new Set();
    state.lastDiffs = [];
    deal();
    state.phase = 'play';
    render();
  });
  screen.append(start);

  return screen;
}

/** Play: current question on top, live console beneath. */
function renderPlay() {
  const screen = el('section', 'screen');

  const bar = el('div', 'topbar');
  const back = el('button', 'topbar__back', '← Done');
  back.setAttribute('type', 'button');
  back.addEventListener('click', () => {
    state.phase = 'home';
    render();
  });
  bar.append(back);

  // An inconspicuous tally of how many have been dealt this session.
  bar.append(el('span', 'topbar__count', `#${state.asked}`));

  const skip = /** @type {HTMLButtonElement} */ (el('button', 'topbar__skip', 'Skip'));
  skip.setAttribute('type', 'button');
  skip.disabled = eligiblePool().length === 0;
  skip.addEventListener('click', () => {
    deal();
    render();
  });
  bar.append(skip);
  screen.append(bar);

  screen.append(renderCard());
  screen.append(renderDeck());

  return screen;
}

/**
 * The current question card. Tapping the card reveals the answer, then taps
 * again to the next question. A visual prompt (a flag) is its own tap target
 * that throws it full-screen for the table. Fixed heights on the card and the
 * answer slot keep the layout from jumping when the answer appears.
 */
function renderCard() {
  const q = state.current;
  const card = el('article', 'qcard');
  makeTappable(card, () => {
    if (!state.current) deal();
    else if (!state.revealed) state.revealed = true;
    else deal();
    render();
  });

  if (!q) {
    const content = el('div', 'qcard__content');
    content.append(el('p', 'qcard__q', 'Pick a category to begin.'));
    card.append(content);
    return card;
  }

  const cat = CATEGORIES.find((c) => c.id === q.cat);
  const meta = el('div', 'qcard__meta');
  meta.append(el('span', 'qcard__cat', cat ? `${cat.emoji} ${cat.name}` : q.cat));
  meta.append(difficultyDots(q.d));
  card.append(meta);

  const content = el('div', 'qcard__content');
  if (q.fmt === 'flag' && q.code) {
    const glyph = el('div', 'qcard__glyph');
    const img = /** @type {HTMLImageElement} */ (el('img'));
    img.src = `flags/${q.code}.svg`;
    img.alt = '';
    glyph.append(img);
    glyph.setAttribute('role', 'button');
    glyph.setAttribute('tabindex', '0');
    glyph.setAttribute('aria-label', 'Show flag full screen');
    // Its own action (present), and stop the tap/key bubbling so the card's
    // reveal doesn't also fire.
    const present = () => {
      state.presenting = true;
      render();
    };
    glyph.addEventListener('click', (e) => {
      e.stopPropagation();
      present();
    });
    glyph.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        present();
      }
    });
    content.append(glyph);
  } else {
    content.append(el('p', 'qcard__q', q.q));
  }
  card.append(content);

  // Answer slot: fixed height, so flipping it never resizes anything.
  const answer = el('div', 'qcard__answer');
  answer.append(
    state.revealed ? el('span', 'qcard__a', q.a) : el('span', 'qcard__ahint', 'Tap to reveal'),
  );
  card.append(answer);

  return card;
}

/** The live console: which categories and difficulties feed the deck. */
function renderDeck() {
  const deck = el('div', 'deck');

  // Categories — multi-select, with All / None for quick soloing.
  const catGroup = el('div', 'deck__group');
  const catHead = el('div', 'deck__head');
  catHead.append(el('span', 'deck__label', 'Categories'));
  const quick = el('div', 'deck__quick');
  const all = el('button', 'linkbtn', 'All');
  all.setAttribute('type', 'button');
  all.addEventListener('click', () => {
    state.cats = new Set(CATEGORIES.map((c) => c.id));
    save();
    render();
  });
  const none = el('button', 'linkbtn', 'None');
  none.setAttribute('type', 'button');
  none.addEventListener('click', () => {
    state.cats = new Set();
    save();
    render();
  });
  quick.append(all, none);
  catHead.append(quick);
  catGroup.append(catHead);
  catGroup.append(
    chipRow(
      CATEGORIES.map((c) => ({ id: c.id, label: `${c.emoji} ${c.name}` })),
      state.cats,
    ),
  );
  deck.append(catGroup);

  // Difficulty — multi-select, keep at least one on.
  const diffGroup = el('div', 'deck__group');
  const diffHead = el('div', 'deck__head');
  diffHead.append(el('span', 'deck__label', 'Difficulty'));
  diffGroup.append(diffHead);
  diffGroup.append(chipRow(DIFFICULTIES, /** @type {Set<string>} */ (state.diffs), { minOne: true }));
  deck.append(diffGroup);

  return deck;
}

/** Full-screen view of a visual prompt, for showing the table. */
function renderPresent() {
  const q = /** @type {Question} */ (state.current);
  const overlay = el('div', 'present');
  overlay.append(el('div', 'present__close', '✕'));
  const glyph = el('div', 'present__glyph');
  const img = /** @type {HTMLImageElement} */ (el('img'));
  img.src = `flags/${q.code}.svg`;
  img.alt = '';
  glyph.append(img);
  overlay.append(glyph);
  makeTappable(overlay, () => {
    state.presenting = false;
    render();
  });
  return overlay;
}

function render() {
  let screen;
  if (state.phase === 'play' && state.presenting && state.current && state.current.fmt) {
    screen = renderPresent();
  } else if (state.phase === 'play') {
    screen = renderPlay();
  } else {
    screen = renderHome();
  }
  app.replaceChildren(screen);
}

load();
render();
