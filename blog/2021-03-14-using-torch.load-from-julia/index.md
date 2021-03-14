@def post_author = "Gregory Sech"
@def title = "Using torch.load from Julia"
@def date = Date(2021, 03, 14)
@def desc = "Using torch.load from Julia"
@def rss = "Using torch.load from Julia"
@def rss_category = "julia"
@def tags = ["pycall", "pytorch"]
@def mintoclevel=2

As part of an experiment we needed to solve a large quantity of linear inequalities described by the coefficient of a very sparse matrix. 


These coefficients were calculated using [PyTorch](https://pytorch.org) by a collegue and, after solving them within [Python](https://www.python.org) with an ad-hoc algorithm, I wanted to solve the system by using a LP solver via [JuMP](https://jump.dev).

I'm a novice of [Julia](https://julialang.org/) but recently, on [the Beginners AMA featuring Dr. Katharine Hyatt and Dr. Rachel Kurchin](https://www.youtube.com/watch?v=sLdlIs_e07E), I've heard about an interesting package called [PyCall.jl](https://github.com/JuliaPy/PyCall.jl). This provides the ability to call Python modules directly from Julia programs.

The setup was quite easy, I just had to follow the instructions of [PyCall.jl's README](https://github.com/JuliaPy/PyCall.jl/blob/master/README.md) about using a different version of Python as I have installed PyTorch in a Anaconda's environment.

It was really easy, I just copied the path to the correct executable and before doing `add PyCall` I've set the `PYTHON` environment variable directly from the Julia REPL then entered Pkg REPL-mode by pressing `]` and finally added PyCall.   
For a full description of the procedure everything is described in the README mentioned above.

After that loading data from PyTorch was pretty straightforward but let me walk you through it:
```julia
using SparseArrays, PyCall

@pyimport torch

data_dict = torch.load("<path to my data>", map_location=torch.device("cpu"))
C_rows = data_dict["ids"][0].numpy() .+ 1
C_cols = data_dict["ids"][1].numpy() .+ 1
C_values = data_dict["values"].numpy()
C = sparse(C_rows, C_cols, C_values)
```

1. I've used `PyCall` to import the `torch` module from Python.
2. Called torch.load as if I was in Python (with the only difference that Julia doesn't allow for single quotes as string delimiters) to load my data, which is a dictionary of tensors.
3. By reading PyCall's README I've discovered that numpy's arrays are automatically converted into an interoperable array type in Julia. I just needed to add a +1 as Julia's indexing starts from 1 by default and didn't really want to mess with [custom indices](https://docs.julialang.org/en/v1/devdocs/offset-arrays/).
4. After I've got all my data loaded I just needed to create my sparse matrix `C` using `sparse` from the [`SparseArrays` module of the Standard Library](https://docs.julialang.org/en/v1.5/stdlib/SparseArrays/).

So today we learned that Julia interpoperabilty with Python is quite easy, even with non standard modules like PyTorch, and that using Numpy's arrays to move data between languages is really neat and painless!