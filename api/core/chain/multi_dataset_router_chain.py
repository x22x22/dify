from typing import Mapping, List, Dict, Any, Optional

from langchain import LLMChain, PromptTemplate, ConversationChain
from langchain.callbacks import CallbackManager
from langchain.chains.base import Chain
from langchain.schema import BaseLanguageModel
from pydantic import Extra

from core.callback_handler.dataset_tool_callback_handler import DatasetToolCallbackHandler
from core.callback_handler.std_out_callback_handler import DifyStdOutCallbackHandler
from core.chain.llm_router_chain import LLMRouterChain, RouterOutputParser
from core.conversation_message_task import ConversationMessageTask
from core.llm.llm_builder import LLMBuilder
from core.tool.dataset_tool_builder import DatasetToolBuilder
from core.tool.llama_index_tool import EnhanceLlamaIndexTool
from models.dataset import Dataset

MULTI_PROMPT_ROUTER_TEMPLATE = """
Given a raw text input to a language model select the model prompt best suited for \
the input. You will be given the names of the available prompts and a description of \
what the prompt is best suited for. You may also revise the original input if you \
think that revising it will ultimately lead to a better response from the language \
model.

<< FORMATTING >>
Return a markdown code snippet with a JSON object formatted to look like, \
no any other string out of markdown code snippet:
```json
{{{{
    "destination": string \\ name of the prompt to use or "DEFAULT"
    "next_inputs": string \\ a potentially modified version of the original input
}}}}
```

REMEMBER: "destination" MUST be one of the candidate prompt names specified below OR \
it can be "DEFAULT" if the input is not well suited for any of the candidate prompts.
REMEMBER: "next_inputs" can just be the original input if you don't think any \
modifications are needed.

<< CANDIDATE PROMPTS >>
{destinations}

<< INPUT >>
{{input}}

<< OUTPUT >>
"""


class MultiDatasetRouterChain(Chain):
    """Use a single chain to route an input to one of multiple candidate chains."""

    router_chain: LLMRouterChain
    """Chain for deciding a destination chain and the input to it."""
    dataset_tools: Mapping[str, EnhanceLlamaIndexTool]
    """Map of name to candidate chains that inputs can be routed to."""

    class Config:
        """Configuration for this pydantic object."""

        extra = Extra.forbid
        arbitrary_types_allowed = True

    @property
    def input_keys(self) -> List[str]:
        """Will be whatever keys the router chain prompt expects.

        :meta private:
        """
        return self.router_chain.input_keys

    @property
    def output_keys(self) -> List[str]:
        return ["text"]

    @classmethod
    def from_datasets(
            cls,
            tenant_id: str,
            datasets: List[Dataset],
            conversation_message_task: ConversationMessageTask,
            **kwargs: Any,
    ):
        """Convenience constructor for instantiating from destination prompts."""
        llm_callback_manager = CallbackManager([DifyStdOutCallbackHandler()])
        llm = LLMBuilder.to_llm(
            tenant_id=tenant_id,
            model_name='gpt-3.5-turbo',
            temperature=0,
            max_tokens=1024,
            callback_manager=llm_callback_manager
        )

        destinations = ["{}: {}".format(d.id, d.description.replace('\n', ' ') if d.description
                        else ('useful for when you want to answer queries about the ' + d.name))
                        for d in datasets]
        destinations_str = "\n".join(destinations)
        router_template = MULTI_PROMPT_ROUTER_TEMPLATE.format(
            destinations=destinations_str
        )
        router_prompt = PromptTemplate(
            template=router_template,
            input_variables=["input"],
            output_parser=RouterOutputParser(),
        )
        router_chain = LLMRouterChain.from_llm(llm, router_prompt)
        dataset_tools = {}
        for dataset in datasets:
            dataset_tool = DatasetToolBuilder.build_dataset_tool(
                dataset=dataset,
                response_mode='no_synthesizer',  # "compact"
                callback_handler=DatasetToolCallbackHandler(conversation_message_task)
            )

            if dataset_tool:
                dataset_tools[dataset.id] = dataset_tool

        return cls(
            router_chain=router_chain,
            dataset_tools=dataset_tools,
            **kwargs,
        )

    def _call(
        self,
        inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        if len(self.dataset_tools) == 0:
            return {"text": ''}
        elif len(self.dataset_tools) == 1:
            return {"text": next(iter(self.dataset_tools.values())).run(inputs['input'])}

        route = self.router_chain.route(inputs)

        if not route.destination:
            return {"text": ''}
        elif route.destination in self.dataset_tools:
            return {"text": self.dataset_tools[route.destination].run(
                route.next_inputs['input']
            )}
        else:
            raise ValueError(
                f"Received invalid destination chain name '{route.destination}'"
            )
