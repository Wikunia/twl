import REPL.REPLCompletions

if "literal" in ARGS
    # literal generator (Julia 1.5.2)
    print("true", " ")
    print("false", " ")
    for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
                        REPLCompletions.completions("", 0)[1])
        try
            v = eval(Symbol(compl.mod))
            if !(v isa Function || v isa Type || v isa TypeVar || v isa Module || v isa Colon)
                print(compl.mod, " ")
            end
        catch e
        end
    end

elseif "built_in" in ARGS
    # built_in generator (Julia 1.5.2)
    for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
                        REPLCompletions.completions("", 0)[1])
        try
            v = eval(Symbol(compl.mod))
            if (v isa Type || v isa TypeVar) && (compl.mod != "=>")
                print(compl.mod, " ")
            end
        catch e
        end
    end

elseif "keywords" in ARGS
    # keyword generator, multi-word keywords handled manually below (Julia 1.5.2)
    foreach(x -> print(x, " "), ["in", "isa", "where"])
    for kw in collect(x.keyword for x in REPLCompletions.complete_keyword(""))
        if !(contains(kw, " ") || kw == "struct")
            print(kw, " ")
        end
    end
end
function f(x::Int, y::T) where {T<:Union{Int,String}}
    v = X{T} where T <: Integes
    hello
end

# Assignment like
# { className: "keyword", begin: "([=!]==)|((?:\\/\\/|<<|>>>|>>)=)|([+\\-*\\/\\\\^÷%&⊻]=)|=" },

# Control flow
# { className: "keyword", begin: "([=!]==)|((?:\\/\\/|<<|>>>|>>)=)|([+\\-*\\/\\\\^÷%&⊻]=)|=" },

//
\

x === hello
x !== hello
x += hello
x -= hello
x *= hello
x //= hello
x /= hello
x /= hello
x \= hello
x ^= hello
x ÷= hello
x %= hello
x <<= hello
x >>>= hello
x >>= hello
x &= hello
x ⊻= hello
x = hello

struct Int
    x::Int


x <: Int

x::Int

z >: Int

Hello{hello}


x = rand()

if x <: hello
end

x::Union{UserType,Nothing}
y <: Union{Tuple{UserType,UserType},Nothing}
y <: Union{Tuple{UserType, UserType}, Nothing}
y <: Union{Tuple{UserType, UserType}, Nothing}

function f(x::T) where T
    x^2
end

f(x) = df

1:f:
function x_to_y(x::T, y::T) where T <: Union{Integer,
        MyType}
    return x^2
end


x = "Docstring"

f(x) = 12


x = "w+hello"
y = """
"w+hello"
"""

struct Struct{T} <: AbstractStruct{T}
end


function f(x::AbstractType{T}, y::Union{Int,S}) where {T, S<:Integer}
    return x
end



function f(x::AbstractType{T}, y::Union{Int,S}) where {T, S<:Integer}
    S <: Integer
    return x
end
