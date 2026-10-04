# Swahili Profanity Filter & Handle Moderation Strategy

This document provides a comprehensive blocklist and implementation guide for moderation systems handling user-generated text and account handle claims in Swahili.

---

## 1. Comprehensive Swahili Word & Slur Blocklist

| Word / Root | Variations / Leetspeak | Category & Risk | Severity | Matching Strategy | Notes / False Positive Warning |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **tomba** | `t0mb4`, `t0mba`, `tomb4`, `t_o_m_b_a` | Sexual / Explicit (To fuck / penetrate) | **High** | Substring / Regex Root | Stem word for many explicit verbs (`kutomba`, `nitakutomba`). |
| **tombwa** | `t0mbw4`, `t0mbwa`, `tombw4` | Sexual / Explicit (To be fucked) | **High** | Substring / Regex Root | Passive form of `tomba`. |
| **dinya** | `d1ny4`, `d1nya`, `diny4` | Sexual / Vulgar (To fuck / screw) | **High** | Substring / Regex Root | Slang for sexual intercourse. |
| **dinywa** | `d1nyw4`, `d1nywa`, `dinyw4` | Sexual / Vulgar (To be fucked) | **High** | Substring / Regex Root | Passive form of `dinya`. |
| **kuma** | `k.u.m.a`, `quma`, `k1m4`, `k0ma` | Sexual / Severe Vulgarity (Vagina) | **High** | Exact / Word Boundary | **CRITICAL FALSE POSITIVES:** Appears in *Kumasi* (city), *Akuma* (gaming name), *Kumamoto*. Do **not** use naive substring matching. |
| **mboo** | `mb00`, `m.b.o.o`, `mb0o` | Sexual / Severe Vulgarity (Penis) | **High** | Exact / Word Boundary | **FALSE POSITIVE:** *Mbooni* (constituency/region in Kenya). Require word boundary or exact match. |
| **msenge** | `ms3ng3`, `m.s.e.n.g.e`, `msng` | Homophobic Slur / Severe Insult | **High** | Substring / Wildcard | Unambiguous slur in standard Swahili context. |
| **malaya** | `m4l4y4`, `mlaya`, `m.a.l.a.y.a` | Slur (Prostitute / Whore) | **High** | Substring / Wildcard | **FALSE POSITIVE:** *Malaya* (region/archaic name for Malaysia). Fine to block for handles. |
| **kahaba** | `k4h4b4`, `khb` | Slur (Harlot / Prostitute) | **High** | Substring / Wildcard | Unambiguous slur. |
| **shoga** | `sh0g4`, `sh0ga`, `shog4` | Homophobic Slur / Insult | **Medium-High**| Exact / Contextual | Coastal Swahili uses *shoga* benignly ("female friend"). In handles, predominantly used offensively. |
| **basha** | `b4sh4`, `b4sha` | Derogatory / Sexual Slur | **Medium-High**| Exact / Word Boundary | Used derogatorily in sexual dynamics. |
| **kuma ya mama** | `kuma_mama`, `kym`, `kuma_yako` | Severe Abuse / Direct Insult | **High** | Phrase / Regex Pattern | Direct maternal insult. |
| **pumbavu** | `pumb4vu`, `pmbvu`, `pumb3vu` | Insult (Idiot / Stupid) | **Medium** | Substring / Wildcard | Common general insult. |
| **jinga / mjinga** | `j1ng4`, `mj1ng4`, `jng` | Insult (Fool / Idiot) | **Medium** | Exact / Word Boundary | **FALSE POSITIVE:** *Jinja* (Ugandan city) can be mistyped. *Jinga* is a root in Portuguese/Angolan proper names (e.g., Queen Jinga). |
| **zuzu** | `zuz0`, `zuz4` | Insult (Simpleton / Fool) | **Low-Medium** | Exact Match | Mild insult, but used in harassment. |
| **mpuuzi** | `mpuuz1`, `mpuz` | Insult (Foolish / Worthless person) | **Medium** | Substring / Wildcard | General harassment term. |
| **mburula** | `mburul4`, `mburulaa` | Insult (Moron / Idiot) | **Medium** | Substring / Wildcard | Slang insult. |
| **matako** | `m4t4k0`, `matak0`, `tako` | Anatomical / Vulgar (Buttocks / Ass) | **Medium** | Exact / Word Boundary | Common vulgar anatomical term. |
| **nyonyo** | `ny0ny0`, `ny0ny0s` | Anatomical / Casual (Breasts / Tits) | **Medium** | Exact Match | Anatomical context. |
| **fisi** | `f1s1`, `f3si` | Harassment / Predator Slang | **Low-Medium** | Exact Match | Literally "hyena", slang for pervert/predator. |
| **nyani** | `ny4n1` | Racial / Personal Slur (Monkey) | **High** | Exact Match | Used as a racial or dehumanizing slur. |
| **mbwa** | `mbw4` | Insult (Dog) | **Medium** | Exact Match | **FALSE POSITIVE:** Appears in proper names like *Mbwana*. Must enforce exact match or boundary check. |
| **kafiri** | `k4f1r1`, `kafr` | Religious Slur (Infidel / Heathen) | **High** | Exact / Word Boundary | Highly offensive in religious contexts. |
| **mchawi** | `mch4w1` | Slander / Harassment (Witch) | **Medium** | Exact / Word Boundary | Used maliciously in personal targeted slander. |

---

## 2. Technical Implementation & String Normalization

To prevent evasion techniques such as character substitution, zero-width spaces, or intentional repetition, run input strings through a pipeline before matching.

### Step 1: Normalization Pipeline
1. **Unicode Canonical Decomposition:** Normalize accents and diacritics (`NFKD` standard).
2. **Remove Hidden & Formatting Characters:** Strip zero-width joiners (`\u200B`), soft hyphens (`\u00AD`), and space replacements.
3. **Leetspeak Translation:** Normalize homoglyphs and number substitutions to base Latin characters:
   * `0` $\rightarrow$ `o`
   * `1`, `!`, `|` $\rightarrow$ `i`
   * `@`, `4` $\rightarrow$ `a`
   * `3` $\rightarrow$ `e`
   * `5`, `$` $\rightarrow$ `s`
4. **De-duplication / Compression:** Reduce repeated adjacent characters (e.g., `toooomba` $\rightarrow$ `tomba`).

### Step 2: Regular Expression Patterns

Below are regex examples targeting primary Swahili explicit roots after normalization:

```regex
# Sexual / Explicit Roots (Matches prefix, suffix, and infix variations)
(?i)\b\w*(t[o0]mb|d[i1]ny)\w*\b

# Explicit Anatomical Words (Strict Word Boundary)
(?i)\b(k[u1]m[a4]|mb[o0]{2}|t[a4]k[o0]|ny[o0]ny[o0])\b

# High-Severity Severe Slurs
(?i)\b\w*(ms[e3]ng[e3]|m[a4]l[a4]y[a4]|k[a4]h[a4]b[a4])\w*\b

# Insults / Harassment Terms
(?i)\b(p[u1]mb[a4]v[u1]|mj[i1]ng[a4]|mp[u1]uz[i1]|mb[u1]r[u1]l[a4])\b
```

---

## 3. Recommended Strategy & Architecture

Swahili is an **agglutinative language** that uses extensive prefixing and suffixing (e.g., *ku-* [infinitive], *nita-* [future subject], *-wa* [passive]). This makes simple dictionary matching prone to either missing conjugated forms or generating false positives on innocent words.

```
       [ Input Username / Handle ]
                    │
                    ▼
       [ 1. Unicode Normalization ]
    (Strip zero-width spaces & accents)
                    │
                    ▼
       [ 2. Leetspeak & Homoglyph Mapping ]
          (Convert "t0mb4" -> "tomba")
                    │
                    ▼
       [ 3. De-duplication Check ]
        (Convert "kumaaa" -> "kuma")
                    │
                    ▼
   ┌────────────────────────────────┐
   │ Is it on the Strict Blocklist? │
   └───────────────┬────────────────┘
                   │
         ┌─────────┴─────────┐
        YES                  NO
         │                   │
         ▼                   ▼
  [ Reject Claim ]   [ 4. Boundary & Regex Evaluation ]
                             │
                   ┌─────────┴─────────┐
                 MATCH               NO MATCH
                   │                   │
                   ▼                   ▼
            [ Reject Claim ]   [ Allow Handle ]
```

### Strategic Recommendations:

1. **Dual-List Model (Strict Block vs. Flag for Review):**
   * **Strict Block (Automated Rejection):** Terms with zero non-profane contexts in handles (`msenge`, `tomba`, `kahaba`, `dinya`).
   * **Boundary Block (Word-Boundary Only):** Words with high false-positive rates when embedded inside larger strings (`kuma`, `mboo`, `mbwa`, `jinga`).
2. **Context-Aware Exception System (Whitelisting):**
   * Maintain an explicit whitelist for common geographically or culturally valid handles (e.g., `kumasi`, `mbooni`, `mbwana`, `jinja`).
3. **User Feedback Strategy:**
   * Do **not** reveal the exact matched word when rejecting a handle, as this helps bad actors craft circumventions. Use generic feedback:
     > *"This username contains terms that do not comply with our community standards. Please choose another."*