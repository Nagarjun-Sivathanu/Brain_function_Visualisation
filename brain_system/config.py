import openai

LLM_BASE_URL = "http://dgx5.humanbrain.in:8999/v1"
LLM_API_KEY = "empty"
LLM_MODEL = "Llama-3.3-70B-Instruct"
LLM_PARAMS = {
    "temperature": 0,
    "frequency_penalty": 1.0,
    "top_p": 0.1,
    "max_tokens": 1000,
}
CONFIDENCE_THRESHOLD = 0.6

# Each entry: folder_name -> {display_name, file_prefix, parent_display_name or None}
REGION_REGISTRY = {
    "Brain": {
        "display_name": "Brain",
        "file_prefix": "Brain",
        "parent": None,
    },
    "prosencephalon": {
        "display_name": "Prosencephalon",
        "file_prefix": "prosencephalon",
        "parent": "Brain",
    },
    "midbrain": {
        "display_name": "Midbrain",
        "file_prefix": "midbrain",
        "parent": "Brain",
    },
    "rhombencephalon": {
        "display_name": "Rhombencephalon",
        "file_prefix": "rhombencephalon",
        "parent": "Brain",
    },
    "diencephalon": {
        "display_name": "Diencephalon",
        "file_prefix": "diencephalon",
        "parent": "Prosencephalon",
    },
    "telencephalon": {
        "display_name": "Telencephalon",
        "file_prefix": "telencephalon",
        "parent": "Prosencephalon",
    },
    "metencephalon": {
        "display_name": "Metencephalon",
        "file_prefix": "metencephalon",
        "parent": "Rhombencephalon",
    },
    "medulla_oblongata": {
        "display_name": "Medulla Oblongata",
        "file_prefix": "medulla oblongata",
        "parent": "Rhombencephalon",
    },
    "fourth_ventricle": {
        "display_name": "Fourth Ventricle",
        "file_prefix": "fourth ventricle",
        "parent": "Rhombencephalon",
    },
    "part_of_midbrain": {
        "display_name": "Part of Midbrain",
        "file_prefix": "part of midbrain",
        "parent": "Midbrain",
    },
    "right_side_of_midbrain": {
        "display_name": "Right Side of Midbrain",
        "file_prefix": "right side of midbrain",
        "parent": "Midbrain",
    },
    "left_side_of_midbrain": {
        "display_name": "Left Side of Midbrain",
        "file_prefix": "left side of midbrain",
        "parent": "Midbrain",
    },
    "aqueduct": {
        "display_name": "Aqueduct",
        "file_prefix": "aqueduct",
        "parent": "Midbrain",
    },
}


def get_llm_client() -> openai.OpenAI:
    return openai.OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
