In this file u will observe that there is a lot of marked agents prompts summary and source list for the named with the names of (name_agentprompt),(name_summary) and (script_name) and so on in each file for each of the avaiable agents 

I want each of these folders to act as thier own indepent agents who : 
- Determines whether it is relevant to the query.
- Explains its role.
- Contributes its specialized knowledge.
- Interacts with other relevant regions.
- Participates in consensus formation.

These agents are haveing a model of:
"import openai

def get_answer_from_llama(prompt):
    message = [
        {"role": "system","content": prompt},
#                    {"role": "user","content":question}
    ]
    
    client = openai.OpenAI(
            base_url="http://dgx5.humanbrain.in:8999/v1",
            api_key="empty",
            )
    
    completion = client.chat.completions.create(
        model = 'Llama-3.3-70B-Instruct',
        messages=message,
        temperature=0,
        frequency_penalty=1.0,
        top_p=0.1,
        max_tokens=1000,
        stream=False
    )
    output = completion.choices[0].message.content
#     output = ''
#     for chunk in completion:
#         if chunk.choices[0].delta.content is not None:
#             output += chunk.choices[0].delta.content
        # print(output)
    return output" 


Make this so that it fits and works for each of them 

The idea is that when lets say a prompt is given it will be given to all of the agents who will take the prompt and tell and reason if they are actualy involved in the process or not and give out their contribution if they think they have any and their confidance value 

So for each of the prompts they are to push out if they think it involes them followed by their confidance and what role they play if they are involed 

Then all these form thier consesnse look at what the other told and contirbuted check if a sublayer of it might be more fit for the task and vote and see if it is a function did by a sub part of it it should be choosen over the parent if it is validated and seen to be true 


All the decision and stuff should be based on the actual bilogical and reasonal than randomly choose and it should use the script file of its own to see for accurate information on its process and involment 

So we are going to do this in lang flow so the plan is that 

1) We broadcast the query to all the agents 
2) Have all the agents parrallely evaluate 
3) Regions see and vote on the implentations and decides who all should proceed aand give priotory to a subregion if it is more apt 
4) If it is confirmed that it does activate it should have a activation command to those agents 
5) Those activated agents should now come out with thier reasonining and functioning 
6) Have those inputs itself ccomptee with each other to see if furthor refinment and specification can be reached 
7) Genrate final conseses of activated regions ,regional roles and so on 
8) Make a final narvite genrater which converts it into human redable text and tell the final story and frame work which was agreed upon