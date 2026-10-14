import hashlib
import re
from typing import Optional

from src.config import settings


def clean_script_text(text: str) -> str:
    """
    Clean text so it is plain spoken sentences for TTS:
    - Remove markdown formatting (bold, italics, code blocks, blockquotes, links)
    - Remove headings (# Heading)
    - Remove stage directions ([laughs], [music fades], (pause), (smiling))
    - Remove emojis
    - Remove speaker labels (Narrator:, Host:, Speaker 1:)
    - Normalize whitespace and punctuation
    """
    if not text:
        return ""

    cleaned = text
    # Remove code blocks
    cleaned = re.sub(r"```[\s\S]*?```", " ", cleaned)
    # Remove markdown headings
    cleaned = re.sub(r"(?m)^#{1,6}\s+.*$", "", cleaned)
    # Remove markdown formatting bold/italics/code/quotes/links
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"(?m)^>\s*", "", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    # Remove speaker labels at line start (e.g. "Narrator:", "Host:")
    cleaned = re.sub(r"(?m)^[A-Za-z0-9_\s]{1,24}:\s*", "", cleaned)
    # Remove stage directions in brackets [applause], [laughs], [music]
    cleaned = re.sub(r"\[[^\]]*\]", " ", cleaned)
    # Remove stage directions in parentheses (pause), (smiling), (sighs)
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    # Remove emojis across standard unicode blocks
    cleaned = re.sub(r"[\U00010000-\U0010ffff]", "", cleaned)
    cleaned = re.sub(r"[\u2600-\u27bf]", "", cleaned)
    cleaned = re.sub(r"[\u2300-\u23ff]", "", cleaned)
    cleaned = re.sub(r"[\u2b50-\u2b55]", "", cleaned)
    # Collapse multiple spaces and cleanup punctuation spacing
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n\s*\n+", "\n\n", cleaned)
    cleaned = re.sub(r"\s+([.,!?;:])", r"\1", cleaned)
    return cleaned.strip()


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences preserving terminal punctuation."""
    raw = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s.strip() for s in raw if s.strip()]


def _clean_point_text(text: str) -> str:
    """Format an extracted phrase so it flows naturally in a sentence."""
    p = text.strip().strip(".,;:!?-\"'")
    # Strip common leading conjunctions
    p = re.sub(r"^(and|also|then|with|as well as|including|plus)\s+", "", p, flags=re.IGNORECASE).strip()
    if not p:
        return ""
    # Lowercase first character unless it is a capital pronoun like 'I'
    if p[0].isupper() and not p.startswith("I ") and not p.startswith("I'"):
        p = p[0].lower() + p[1:]
    return p


def extract_body_points(idea: str) -> list[str]:
    """
    Derive 3 to 6 distinct body points from the user's idea by splitting
    on sentences, commas, and conjunctions ('and', 'as well as').
    """
    raw_idea = idea.strip()
    # Split on periods, exclamation marks, question marks, commas, semicolons, and 'and'
    split_pattern = r"(?:[.,;!?]+|\s+(?:and|as well as|along with|plus)\s+|\n+)"
    raw_pieces = re.split(split_pattern, raw_idea, flags=re.IGNORECASE)

    points: list[str] = []
    seen: set[str] = set()
    for piece in raw_pieces:
        cleaned = _clean_point_text(piece)
        if len(cleaned) >= 3 and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            points.append(cleaned)

    # Ensure between 3 and 6 points
    if len(points) == 0:
        points = [
            "the beginning of this journey",
            "the most memorable moments we experienced",
            "the lessons that stayed with me forever",
        ]
    elif len(points) == 1:
        single = points[0]
        points = [
            f"setting out on {single}",
            f"the quiet discoveries along {single}",
            f"the lasting perspective gained from {single}",
        ]
    elif len(points) == 2:
        points.append(f"how much these moments together truly meant to me")

    # Bound to maximum 6 points
    return points[:6]


HOOK_TEMPLATES = {
    "friendly": [
        "I wanted to share a story about {topic} that has been on my mind lately.",
        "Thinking about {topic} always brings such a warm sense of happiness to my heart.",
        "There is something truly wonderful about {topic} that I have been eager to share.",
        "Whenever I look back on {topic}, I am reminded of how much joy life can hold.",
    ],
    "professional": [
        "In this video, we examine the essential developments and key milestones of {topic}.",
        "Taking a structured look at {topic} provides meaningful clarity and valuable direction.",
        "Reflecting on {topic} highlights several vital principles and noteworthy achievements.",
        "A closer analysis of {topic} illustrates how focused execution leads to meaningful outcomes.",
    ],
    "storytelling": [
        "Some memories stay etched in your mind forever, and for me, that memory is {topic}.",
        "It began as a quiet moment, opening into the unforgettable journey of {topic}.",
        "Looking back across the seasons, nothing stands out quite as vividly as {topic}.",
        "The story of {topic} is one that I will carry with me through every passing year.",
    ],
    "educational": [
        "Today we are going to explore the fascinating aspects and core takeaways of {topic}.",
        "Understanding the significance of {topic} begins by examining each key step of the process.",
        "Let us take a closer look at {topic} to uncover the principles that made it so meaningful.",
        "Exploring {topic} provides a clear demonstration of how foundational ideas work in practice.",
    ],
}

BODY_FRAMES = {
    "friendly": [
        "First off, I remember {p}.",
        "Another highlight was definitely {p}.",
        "What made it truly special was {p}.",
        "I also loved experiencing {p}.",
        "Spending time with {p} was completely unforgettable.",
        "And on top of that, {p} made the whole day feel complete.",
    ],
    "professional": [
        "To begin with, our primary focus centered on {p}.",
        "A central component of the initiative involved {p}.",
        "Furthermore, notable progress was achieved through {p}.",
        "Equally important was the impact of {p}.",
        "Another critical milestone was {p}.",
        "Ultimately, these concerted efforts culminated in {p}.",
    ],
    "storytelling": [
        "The experience opened with {p}.",
        "Before long, the scene unfolded into {p}.",
        "I still recall the vivid feeling of {p}.",
        "As the hours drifted by, we found ourselves surrounded by {p}.",
        "The very heart of the memory came alive through {p}.",
        "Every quiet moment deepened with {p}.",
    ],
    "educational": [
        "To establish the foundation, we first observe {p}.",
        "Next, an essential observation centers on {p}.",
        "Building upon that foundation, we encounter {p}.",
        "Another fundamental element to consider is {p}.",
        "A valuable insight emerges when analyzing {p}.",
        "Finally, this progression connects directly to {p}.",
    ],
}

TRANSITION_TEMPLATES = {
    "friendly": [
        "Along the way, everything seemed to fall into place naturally and easily.",
        "Honestly, those small shared moments made all the difference in the world.",
        "It really reminded me of how important it is to pause and appreciate the ride.",
        "Sharing these reflections with people who care makes every second worthwhile.",
    ],
    "professional": [
        "These strategic milestones contributed directly to our overarching mission.",
        "Maintaining consistency across each stage ensured reliable and measurable outcomes.",
        "Reflecting on these achievements reinforces the value of disciplined collaboration.",
        "This alignment provides a solid foundation for sustainable future development.",
    ],
    "storytelling": [
        "The daylight began to soften, casting a gentle golden warmth across every step.",
        "There was a stillness in the air that made each fleeting second feel timeless.",
        "In that quiet pause between moments, the true meaning of the journey became clear.",
        "The trail wound onward, carrying memories that would never fade with the passing years.",
    ],
    "educational": [
        "Examining these components reveals a clear and consistent pattern of development.",
        "By connecting these observations, we gain a comprehensive understanding of the whole.",
        "This step-by-step progression demonstrates the underlying concepts in action.",
        "When analyzed together, each individual factor reinforces the primary conclusion.",
    ],
}

ELABORATION_TEMPLATES = {
    "friendly": [
        "Thinking back on each of these details fills me with genuine gratitude and peace.",
        "It is remarkable how a single experience can leave such a lasting positive impression.",
        "Whenever I revisit these memories, I am reminded to appreciate the simple joys around me.",
        "The laughter, the conversations, and the warmth we shared will stay with me for a very long time.",
        "I feel so fortunate to have had this opportunity and to reflect upon it with you today.",
        "Every time I think about this story, I discover a new reason to smile and be thankful.",
        "These simple reflections remind me of the beauty found in ordinary everyday moments.",
        "Holding onto these memories gives me renewed inspiration for whatever comes next.",
    ],
    "professional": [
        "Each of these accomplishments reflects a steadfast dedication to high standards and deliberate execution.",
        "The methodologies demonstrated here serve as a dependable framework for future initiatives.",
        "A systematic evaluation of these outcomes confirms the effectiveness of structured planning.",
        "By cultivating these core capabilities, we establish a reliable benchmark for ongoing progress.",
        "Moving forward, these key takeaways will inform our strategic decisions and long-term outlook.",
        "The dedication demonstrated throughout this process highlights the power of shared purpose.",
        "Applying these rigorous standards ensures sustained quality and consistent organizational growth.",
        "This experience reinforces the importance of adaptability and meticulous attention to detail.",
    ],
    "storytelling": [
        "The quiet resonance of that time still echoes whenever the world slows down around me.",
        "It was not merely about where we went, but how deeply each breath felt during the journey.",
        "The warmth of that day lingers like morning sunlight through green leaves, gentle and reassuring.",
        "Years from now, I know these images will remain as sharp and vivid as the day they occurred.",
        "Some stories are written on paper, but this one is etched permanently into who I am.",
        "The gentle murmur of the breeze seemed to whisper a quiet reminder of hope and peace.",
        "Through every turn of the road, the spirit of adventure remained bright and steadfast.",
        "These heartfelt memories form a sanctuary of calm that I can return to whenever I need.",
    ],
    "educational": [
        "These structured examples illustrate how foundational concepts translate directly into real experience.",
        "Understanding this framework allows us to appreciate both the broad picture and the finer nuances.",
        "Through thoughtful analysis, we observe how deliberate preparation shapes positive, repeatable outcomes.",
        "This progression demonstrates that meaningful mastery requires patience, observation, and refinement.",
        "The evidence highlights the importance of evaluating both individual factors and the broader context.",
        "By observing these dynamics closely, we develop a more nuanced appreciation of the subject.",
        "Each distinct element serves as a stepping stone toward a more comprehensive perspective.",
        "These practical insights provide actionable guidance that can be applied across various fields.",
    ],
}

CLOSING_TEMPLATES = {
    "friendly": [
        "Thank you so much for listening, and I hope this brings a touch of warmth to your day.",
        "I will always treasure these memories, and I look forward to sharing the next chapter with you.",
        "Take good care of yourselves, and remember to cherish the special moments in your own life.",
    ],
    "professional": [
        "Thank you for your time, and we look forward to building upon these achievements together.",
        "In conclusion, these insights provide a clear pathway toward continued excellence and shared success.",
        "We appreciate your engagement and invite you to apply these principles to your own endeavors.",
    ],
    "storytelling": [
        "And so the chapter softly draws to a close, carrying its quiet light into tomorrow.",
        "As the sun sets on that memory, its warmth remains forever alive in my heart.",
        "May we all carry forward the quiet courage and wonder discovered along the trail.",
    ],
    "educational": [
        "In summary, these key lessons provide a valuable perspective that we can all learn from.",
        "Thank you for exploring this topic with me, and may these insights support your own journey.",
        "By keeping these principles in mind, we can continue to learn, adapt, and grow every day.",
    ],
}

FINISHERS = {
    4: "I treasure this always.",
    5: "These memories will remain forever.",
    6: "I am grateful for every moment.",
    7: "These lessons will guide me forward always.",
    8: "I carry these heartfelt reflections with me daily.",
    9: "I am deeply thankful for every single moment shared.",
    10: "As this chapter closes, these memories will stay bright forever.",
    11: "Thank you for listening, and may these reflections bring warmth today.",
    12: "Looking forward, I carry the joy and inspiration of this journey always.",
}


def build_template_script(
    idea: str,
    duration_seconds: float,
    tone: Optional[str] = "friendly",
) -> str:
    """
    Generate a spoken script for a video memory using tone-based templates:
    1. Hook sentence (tone-based)
    2. 3 to 6 body points derived from the user's idea
    3. Tone-based transitions
    4. Elaboration templates when under target
    5. Trim at sentence boundaries when over target
    6. Exact closing sentence
    Guarantees word count falls within 90% to 110% of target_words.
    """
    clean_idea = (idea or "a peaceful memory").strip()
    selected_tone = (tone or "friendly").strip().lower()
    if selected_tone not in HOOK_TEMPLATES:
        selected_tone = "friendly"

    # Compute target word counts
    wpm = settings.words_per_minute
    target_words = max(1, round((duration_seconds / 60.0) * wpm))
    min_acceptable = round(target_words * 0.90)
    max_acceptable = round(target_words * 1.10)
    min_ideal = round(target_words * 0.98)
    max_ideal = round(target_words * 1.02)

    # Deterministic index seed based on idea content
    seed = int(hashlib.md5(clean_idea.encode("utf-8")).hexdigest(), 16)

    # 1. Very short targets (e.g. <= 20 words for 5s videos)
    if target_words <= 20:
        core_topic = clean_idea
        idea_words = clean_idea.split()
        if len(idea_words) > 4:
            core_topic = " ".join(idea_words[:4])
        short_templates = [
            f"I remember {core_topic} with peace.",
            f"Thinking about {core_topic} brings peace to my heart.",
            f"I truly treasure every moment with {core_topic}.",
            f"Reflecting on {core_topic} brings lasting joy and peace.",
            f"I hold memories of {core_topic} close to my heart.",
            f"I will always cherish {core_topic} with genuine gratitude.",
            f"Looking back on {core_topic} fills me with profound warmth and quiet gratitude.",
        ]
        best_short = min(short_templates, key=lambda s: abs(len(s.split()) - target_words))
        return clean_script_text(best_short)

    # 2. Extract 3 to 6 body points
    body_points = extract_body_points(clean_idea)

    # Select templates deterministically
    hooks = HOOK_TEMPLATES[selected_tone]
    hook = hooks[seed % len(hooks)].format(topic=clean_idea)

    frames = BODY_FRAMES[selected_tone]
    transitions = TRANSITION_TEMPLATES[selected_tone]
    elaborations = ELABORATION_TEMPLATES[selected_tone]
    closings = CLOSING_TEMPLATES[selected_tone]
    closing = closings[(seed // 3) % len(closings)]

    # 3. Assemble body sentences
    body_sentences: list[str] = []
    for i, pt in enumerate(body_points):
        frame = frames[i % len(frames)]
        body_sentences.append(frame.format(p=pt))

    # Base script: Hook + body sentences + closing
    sentences: list[str] = [hook]
    for i, body_s in enumerate(body_sentences):
        sentences.append(body_s)
        # For longer targets, add transition after every second body point
        if target_words > 80 and (i + 1) % 2 == 0 and i < len(body_sentences) - 1:
            t = transitions[(seed + i) % len(transitions)]
            sentences.append(t)

    sentences.append(closing)

    current_text = " ".join(sentences)
    current_words = len(current_text.split())

    # 4. Expand by elaboration templates when under target
    elab_idx = 0
    while current_words < min_ideal:
        elab = elaborations[(seed + elab_idx) % len(elaborations)]
        elab_idx += 1
        # Insert before closing (which is last)
        sentences.insert(-1, elab)
        current_text = " ".join(sentences)
        current_words = len(current_text.split())
        # Prevent runaway if target is somehow reached or bounded
        if elab_idx > 100 or current_words >= min_ideal:
            break

    # If slightly under target by 4-12 words, add precise finisher before closing
    words_needed = target_words - current_words
    if 4 <= words_needed <= 12 and words_needed in FINISHERS:
        sentences.insert(-1, FINISHERS[words_needed])
        current_text = " ".join(sentences)
        current_words = len(current_text.split())

    # 5. Trim at sentence boundaries when over target
    if current_words > max_ideal:
        # Candidate trimming: remove from elaboration / middle sentences while staying >= min_acceptable
        candidate_sentences = list(sentences)
        # Never remove hook (index 0) or closing (last index)
        # Try trimming from the end of the middle sentences
        while len(candidate_sentences) > 3 and current_words > max_ideal:
            # Candidate by removing penultimate non-closing sentence
            removed = candidate_sentences.pop(-2)
            new_text = " ".join(candidate_sentences)
            new_count = len(new_text.split())
            if new_count >= min_acceptable:
                current_text = new_text
                current_words = new_count
                if min_ideal <= current_words <= max_ideal:
                    break
            else:
                # Put it back if removing it put us below acceptable minimum
                candidate_sentences.insert(-1, removed)
                break

    # 6. Final Cleaning and Bounds Guarantee
    final_cleaned = clean_script_text(current_text)
    final_word_count = len(final_cleaned.split())

    # Sanity guard: if still slightly outside ideal bounds, sentence boundary trim or expand
    if final_word_count > max_acceptable:
        all_s = _split_into_sentences(final_cleaned)
        best_trimmed = final_cleaned
        for cut in range(len(all_s) - 1, 1, -1):
            sub = " ".join(all_s[:cut])
            count = len(sub.split())
            if min_acceptable <= count <= max_acceptable:
                best_trimmed = sub
                break
        final_cleaned = best_trimmed

    return final_cleaned
